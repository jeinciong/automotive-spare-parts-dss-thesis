import { useState, useRef, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { GlobalFilters } from "../../App";
import { useSalesReports, SalesReport } from "../../contexts/SalesReportsContext";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Area,
  AreaChart, PieChart, Pie, Cell, ComposedChart, ReferenceLine
} from "recharts";
import { 
  TrendingUp, TrendingDown, ArrowUpRight, Download, FileText, DollarSign, ShoppingCart, Package, Activity,
  Plus, Pencil, Trash2, Upload, FileSpreadsheet, Search, X, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle,
  Brain, Info
} from "lucide-react";
import { useForecast, MODEL_DESCRIPTIONS } from "../../contexts/ForecastContext";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useInventory } from "../../contexts/InventoryContext";
import { formatCurrency, PESO_SYMBOL } from "../../lib/currency";

interface SalesReportsViewProps {
  globalFilters?: GlobalFilters;
  user: { role?: string } | null;
}

export function SalesReportsView({ globalFilters, user }: SalesReportsViewProps) {
  const isStaff = user?.role === 'staff' || user?.role === 'Business';
  const { salesReports, addSalesReport, updateSalesReport, deleteSalesReport, importFromCSV } = useSalesReports();
  const { inventory } = useInventory();
  const { productForecasts, runForecast } = useForecast();
  
  // Dynamic Chart Calculations
  const salesTrendData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months.map((month, i) => {
      const monthlyReports = salesReports.filter(r => new Date(r.reportDate).getMonth() === i);
      return {
        month,
        sales: monthlyReports.reduce((sum, r) => sum + r.totalAmount, 0),
        orders: monthlyReports.length
      };
    }).filter(data => data.orders > 0); // Only show months that have data
  }, [salesReports]);

  const topProductsData = useMemo(() => {
    const productMap = new Map();
    salesReports.forEach(r => {
      const current = productMap.get(r.productName) || { name: r.productName, sales: 0, revenue: 0 };
      productMap.set(r.productName, {
        name: r.productName,
        sales: current.sales + r.quantity,
        revenue: current.revenue + r.totalAmount
      });
    });
    return Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5); // Top 5 only
  }, [salesReports]);

  const categoryData = useMemo(() => {
    const categoryMap = new Map();
    const colors = ["#FF6B00", "#607D8B", "#212121", "#B0BEC5", "#FFA726", "#424242"];
    const totalRev = salesReports.reduce((sum, r) => sum + r.totalAmount, 0);
    
    salesReports.forEach(r => {
      const currentRev = categoryMap.get(r.category) || 0;
      categoryMap.set(r.category, currentRev + r.totalAmount);
    });

    return Array.from(categoryMap.entries()).map(([name, revenue], index) => ({
      name,
      value: totalRev > 0 ? Number(((revenue / totalRev) * 100).toFixed(0)) : 0,
      color: colors[index % colors.length]
    }));
  }, [salesReports]);
  
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [addEditModalOpen, setAddEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<SalesReport | null>(null);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedProduct, setSelectedProduct] = useState<{productName: string; category: string} | null>(null);
  const [productDetailModalOpen, setProductDetailModalOpen] = useState(false);
  const [timePeriod, setTimePeriod] = useState<"weekly" | "monthly" | "yearly">("monthly");

  // Auto-run forecast when product detail modal opens
  useEffect(() => {
    if (productDetailModalOpen && selectedProduct) {
      const cached = productForecasts[selectedProduct.productName];
      // Only run if not already loaded/loading
      if (!cached || (!cached.loading && !cached.forecasts?.length && !cached.error)) {
        runForecast(selectedProduct.productName, 6);
      }
    }
  }, [productDetailModalOpen, selectedProduct]);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [rowsPerPage, setRowsPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Form state for Add/Edit
  const [formData, setFormData] = useState({
    reportDate: "",
    productName: "",
    category: "",
    quantity: 1,
    unitPrice: 0,
    customerName: "",
    paymentMethod: "Cash",
    status: "Completed" as "Completed" | "Pending" | "Cancelled",
    orderNumber: "",
    notes: ""
  });

  const selectedInvItem = inventory.find(i => i.name === formData.productName);
  const isOverStock = !!selectedInvItem && formData.quantity > selectedInvItem.currentStock;

  // Calculate summary statistics
  const totalRevenue = salesReports.reduce((sum, report) => sum + report.totalAmount, 0);
  const totalOrders = salesReports.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const completedOrders = salesReports.filter(r => r.status === "Completed").length;
  
  // DYNAMIC GROWTH RATE CALCULATION 
  const growthRate = useMemo(() => {
    if (salesReports.length === 0) return 0;

    // Group revenue by Year-Month
    const monthlyRevenue: { [key: string]: number } = {};
    salesReports.forEach(report => {
      const date = new Date(report.reportDate);
      const key = `${date.getFullYear()}-${date.getMonth()}`; // e.g., "2021-5" for June
      monthlyRevenue[key] = (monthlyRevenue[key] || 0) + report.totalAmount;
    });

    // Sort the months to find the most recent ones
    const sortedMonths = Object.keys(monthlyRevenue).sort().reverse();
    
    if (sortedMonths.length < 2) return 0; // Need at least 2 months to compare

    const latestMonthRev = monthlyRevenue[sortedMonths[0]];  
    const previousMonthRev = monthlyRevenue[sortedMonths[1]]

    // Calculate Percentage Growth: ((New - Old) / Old) * 100
    if (previousMonthRev === 0) return 0;
    const percentage = ((latestMonthRev - previousMonthRev) / previousMonthRev) * 100;
    
    return parseFloat(percentage.toFixed(1));
  }, [salesReports]);

  // Filter reports based on search and global filters
  const filteredReports = salesReports.filter(report => {
    // Search filter (use global search if available, otherwise use local)
    const searchQuery = globalFilters?.searchTerm || searchTerm;
    const matchesSearch = !searchQuery || 
      report.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.category.toLowerCase().includes(searchQuery.toLowerCase());

    // Category filter
    const matchesCategory = !globalFilters?.categories?.length || 
      globalFilters.categories.includes(report.category);

    // Date range filter
    let matchesDateRange = true;
    if (globalFilters?.dateRange && globalFilters.dateRange !== "all") {
      const reportDate = new Date(report.reportDate);
      const today = new Date();
      
      if (globalFilters.dateRange === "custom" && globalFilters.customDateRange) {
        const fromDate = new Date(globalFilters.customDateRange.from);
        const toDate = new Date(globalFilters.customDateRange.to);
        matchesDateRange = reportDate >= fromDate && reportDate <= toDate;
      } else if (globalFilters.dateRange === "today") {
        matchesDateRange = reportDate.toDateString() === today.toDateString();
      } else if (globalFilters.dateRange === "thisweek") {
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        matchesDateRange = reportDate >= weekAgo;
      } else if (globalFilters.dateRange === "october") {
        matchesDateRange = reportDate.getMonth() === 9 && reportDate.getFullYear() === 2025;
      } else if (globalFilters.dateRange === "september") {
        matchesDateRange = reportDate.getMonth() === 8 && reportDate.getFullYear() === 2025;
      } else if (globalFilters.dateRange === "august") {
        matchesDateRange = reportDate.getMonth() === 7 && reportDate.getFullYear() === 2025;
      } else if (globalFilters.dateRange === "q3") {
        matchesDateRange = [6, 7, 8].includes(reportDate.getMonth()) && reportDate.getFullYear() === 2025;
      } else if (globalFilters.dateRange === "q2") {
        matchesDateRange = [3, 4, 5].includes(reportDate.getMonth()) && reportDate.getFullYear() === 2025;
      } else if (globalFilters.dateRange === "ytd") {
        matchesDateRange = reportDate.getFullYear() === 2025;
      }
    }

    return matchesSearch && matchesCategory && matchesDateRange;
  });

  // Sort reports
  const sortedReports = [...filteredReports].sort((a, b) => {
    if (!sortColumn) return 0;

    let aValue: any;
    let bValue: any;

    switch (sortColumn) {
      case "date":
        aValue = new Date(a.reportDate).getTime();
        bValue = new Date(b.reportDate).getTime();
        break;
      case "orderNumber":
        aValue = a.orderNumber.toLowerCase();
        bValue = b.orderNumber.toLowerCase();
        break;
      case "product":
        aValue = a.productName.toLowerCase();
        bValue = b.productName.toLowerCase();
        break;
      case "category":
        aValue = a.category.toLowerCase();
        bValue = b.category.toLowerCase();
        break;
      case "customer":
        aValue = a.customerName.toLowerCase();
        bValue = b.customerName.toLowerCase();
        break;
      case "quantity":
        aValue = a.quantity;
        bValue = b.quantity;
        break;
      case "unitPrice":
        aValue = a.unitPrice;
        bValue = b.unitPrice;
        break;
      case "total":
        aValue = a.totalAmount;
        bValue = b.totalAmount;
        break;
      case "payment":
        aValue = a.paymentMethod.toLowerCase();
        bValue = b.paymentMethod.toLowerCase();
        break;
      case "status":
        aValue = a.status.toLowerCase();
        bValue = b.status.toLowerCase();
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  // Handle column sort
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  // Reset to page 1 whenever filter/search changes
  const totalRows  = sortedReports.length;
  const totalPages = rowsPerPage === -1 ? 1 : Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedReports = rowsPerPage === -1
    ? sortedReports
    : sortedReports.slice((safeCurrentPage - 1) * rowsPerPage, safeCurrentPage * rowsPerPage);

  // Render sort icon
  const renderSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-4 h-4 ml-1 inline opacity-40" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="w-4 h-4 ml-1 inline text-[#FF6B00]" />
      : <ArrowDown className="w-4 h-4 ml-1 inline text-[#FF6B00]" />;
  };

  const handleExport = () => {
    toast.promise(
      new Promise((resolve) => {
        setTimeout(() => {
          // Create CSV content
          const headers = ["ID", "Date", "Product", "Category", "Quantity", "Unit Price", "Total", "Customer", "Payment", "Status", "Order #"];
          const csvContent = [
            headers.join(","),
            ...salesReports.map(report => [
              report.id,
              report.reportDate,
              report.productName,
              report.category,
              report.quantity,
              report.unitPrice,
              report.totalAmount,
              report.customerName,
              report.paymentMethod,
              report.status,
              report.orderNumber
            ].join(","))
          ].join("\n");

          // Create download
          const blob = new Blob([csvContent], { type: 'text/csv' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `sales-reports-${new Date().toISOString().split('T')[0]}.csv`;
          a.click();
          window.URL.revokeObjectURL(url);
          
          resolve(true);
        }, 1000);
      }),
      {
        loading: 'Exporting sales data...',
        success: 'Sales data exported successfully!',
        error: 'Failed to export data',
      }
    );
  };

  const handleGenerateReport = () => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 2500)),
      {
        loading: 'Generating comprehensive sales report...',
        success: 'Report generated successfully! Check your downloads folder.',
        error: 'Failed to generate report',
      }
    );
  };

  const handleAddReport = () => {
    setEditingReport(null);
    setFormData({
      reportDate: new Date().toISOString().split('T')[0],
      productName: "",
      category: "",
      quantity: 1,
      unitPrice: 0,
      customerName: "",
      paymentMethod: "Cash",
      status: "Completed",
      orderNumber: `ORD-${Date.now()}`,
      notes: ""
    });
    setAddEditModalOpen(true);
  };

  const handleEditReport = (report: SalesReport) => {
    setEditingReport(report);
    setFormData({
      reportDate: report.reportDate,
      productName: report.productName,
      category: report.category,
      quantity: report.quantity,
      unitPrice: report.unitPrice,
      customerName: report.customerName,
      paymentMethod: report.paymentMethod,
      status: report.status,
      orderNumber: report.orderNumber,
      notes: report.notes || ""
    });
    setAddEditModalOpen(true);
  };

  const handleDeleteReport = (id: string) => {
    setReportToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (reportToDelete) {
      deleteSalesReport(reportToDelete);
      setDeleteDialogOpen(false);
      setReportToDelete(null);
    }
  };

  const handleProductClick = (productName: string, category: string) => {
    setSelectedProduct({ productName, category });
    setProductDetailModalOpen(true);
  };

  // Calculate product statistics
  const getProductStats = (productName: string) => {
    const productReports = salesReports.filter(r => r.productName === productName);
    const totalRevenue = productReports.reduce((sum, r) => sum + r.totalAmount, 0);
    const totalOrders = productReports.length;
    const totalQuantity = productReports.reduce((sum, r) => sum + r.quantity, 0);
    
    // Calculate growth rate (comparing recent vs older orders)
    const midPoint = Math.floor(productReports.length / 2);
    const recentRevenue = productReports.slice(0, midPoint).reduce((sum, r) => sum + r.totalAmount, 0);
    const olderRevenue = productReports.slice(midPoint).reduce((sum, r) => sum + r.totalAmount, 0);
    const growthRate = olderRevenue > 0 ? ((recentRevenue - olderRevenue) / olderRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalOrders,
      totalQuantity,
      growthRate,
      reports: productReports
    };
  };

  // Calculate time-period-based statistics
  const getTimePeriodStats = (productName: string, period: "weekly" | "monthly" | "yearly") => {
    const productReports = salesReports.filter(r => r.productName === productName);
    const now = new Date();
    
    // Group reports by time period
    const periodGroups: { [key: string]: { revenue: number; orders: number } } = {};
    
    productReports.forEach(report => {
      const reportDate = new Date(report.reportDate);
      let periodKey = "";
      
      if (period === "weekly") {
        // Get week number
        const weekStart = new Date(reportDate);
        weekStart.setDate(reportDate.getDate() - reportDate.getDay());
        periodKey = weekStart.toISOString().split('T')[0];
      } else if (period === "monthly") {
        // Get month and year
        periodKey = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}`;
      } else {
        // Get year
        periodKey = `${reportDate.getFullYear()}`;
      }
      
      if (!periodGroups[periodKey]) {
        periodGroups[periodKey] = { revenue: 0, orders: 0 };
      }
      
      periodGroups[periodKey].revenue += report.totalAmount;
      periodGroups[periodKey].orders += 1;
    });
    
    // Convert to array and sort by date (most recent first)
    const periodsArray = Object.entries(periodGroups).map(([key, data]) => ({
      period: key,
      revenue: data.revenue,
      orders: data.orders
    })).sort((a, b) => b.period.localeCompare(a.period));
    
    return periodsArray;
  };

  const handleSubmitReport = () => {
    // 1. Final Stock Validation
    const selectedInvItem = inventory.find(i => i.name === formData.productName);
    
    if (selectedInvItem && formData.quantity > selectedInvItem.currentStock) {
      toast.error(`Cannot complete sale. Only ${selectedInvItem.currentStock} units available.`);
      return; // Stop the function here
    }

    setIsLoading(true);
    
    setTimeout(() => {
      const totalAmount = formData.quantity * formData.unitPrice;
      
      if (editingReport) {
        updateSalesReport(editingReport.id, {
          ...formData,
          totalAmount
        });
      } else {
        addSalesReport({
          ...formData,
          totalAmount
        });
      }
      
      setAddEditModalOpen(false);
      setIsLoading(false);
    }, 500);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);

    try {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const data = event.target?.result;
          
          // Check if it's Excel or CSV
          if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            // Handle Excel file
            const workbook = XLSX.read(data, { type: 'binary' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const csvData = XLSX.utils.sheet_to_csv(worksheet);
            
            importFromCSV(csvData);
          } else if (file.name.endsWith('.csv')) {
            // Handle CSV file
            importFromCSV(data as string);
          } else {
            toast.error("Please upload a valid Excel (.xlsx, .xls) or CSV file");
          }
          
          setImportModalOpen(false);
          setIsLoading(false);
          
          // Reset file input
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        } catch (error) {
          toast.error("Failed to process file. Please check the format.");
          setIsLoading(false);
          console.error("File processing error:", error);
        }
      };

      if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
      } else {
        reader.readAsBinaryString(file);
      }
    } catch (error) {
      toast.error("Failed to read file");
      setIsLoading(false);
      console.error("File read error:", error);
    }
  };

  const downloadTemplate = () => {
    const template = [
      "reportDate,productName,category,quantity,unitPrice,totalAmount,customerName,paymentMethod,status,orderNumber,notes",
      "2025-10-20,Sample Product,Engine Parts,2,100,200,Sample Customer,Credit Card,Completed,ORD-SAMPLE,Sample notes"
    ].join("\n");

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sales-report-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success("Template downloaded successfully!");
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 100,
        damping: 10
      }
    }
  };

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div className="flex items-center justify-between" variants={itemVariants}>
        <div>
          <h1>Sales Reports</h1>
          <p className="text-muted-foreground">
            Comprehensive sales analysis and reporting for automotive parts
          </p>
        </div>
        <div className="flex space-x-2">
          {/* HIDE FOR STAFF */}
          {!isStaff && (
            <>
              <Button variant="outline" onClick={() => setImportModalOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </>
          )}
          
          <Button 
            className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]" 
            onClick={handleAddReport}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Report
          </Button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      {!isStaff && (
      <motion.div className="grid grid-cols-1 md:grid-cols-4 gap-6" variants={containerVariants}>
        <motion.div 
          variants={itemVariants} 
          whileHover={{ scale: 1.02 }} 
          whileTap={{ scale: 0.98 }}
        >
          <Card 
            className="border-0 shadow-lg cursor-pointer hover:shadow-xl transition-all"
            onClick={() => setModalOpen("revenue")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Total Revenue</CardTitle>
              <div className="p-2 bg-gradient-to-br from-[#FF6B00] to-[#FF8A50] rounded-lg">
                <DollarSign className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">{formatCurrency(totalRevenue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
              <div className="flex items-center text-sm text-green-600">
                <ArrowUpRight className="w-4 h-4 mr-1" />
                <span>+22.5% vs last year</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          variants={itemVariants} 
          whileHover={{ scale: 1.02 }} 
          whileTap={{ scale: 0.98 }}
        >
          <Card 
            className="border-0 shadow-lg cursor-pointer hover:shadow-xl transition-all"
            onClick={() => setModalOpen("orders")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Total Orders</CardTitle>
              <div className="p-2 bg-gradient-to-br from-[#607D8B] to-[#B0BEC5] rounded-lg">
                <ShoppingCart className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">{totalOrders.toLocaleString()}</div>
              <div className="flex items-center text-sm text-green-600">
                <ArrowUpRight className="w-4 h-4 mr-1" />
                <span>+18.2% vs last year</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          variants={itemVariants} 
          whileHover={{ scale: 1.02 }} 
          whileTap={{ scale: 0.98 }}
        >
          <Card 
            className="border-0 shadow-lg cursor-pointer hover:shadow-xl transition-all"
            onClick={() => setModalOpen("average")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Avg Order Value</CardTitle>
              <div className="p-2 bg-gradient-to-br from-[#212121] to-[#424242] rounded-lg">
                <Package className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">{formatCurrency(avgOrderValue)}</div>
              <div className="flex items-center text-sm text-green-600">
                <ArrowUpRight className="w-4 h-4 mr-1" />
                <span>+5.3% vs last year</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          variants={itemVariants} 
          whileHover={{ scale: 1.02 }} 
          whileTap={{ scale: 0.98 }}
        >
          <Card 
            className="border-0 shadow-lg cursor-pointer hover:shadow-xl transition-all"
            onClick={() => setModalOpen("growth")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Growth Rate</CardTitle>
              <div className="p-2 bg-gradient-to-br from-[#FFA726] to-[#FF6B00] rounded-lg">
                <Activity className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl mb-1 ${growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {growthRate > 0 ? '+' : ''}{growthRate}%
              </div>
              <div className="flex items-center text-sm">
                {growthRate >= 0 ? (
                  <span className="text-green-600 flex items-center"><ArrowUpRight className="w-4 h-4 mr-1" /> Trending Up</span>
                ) : (
                  <span className="text-red-600 flex items-center"><TrendingDown className="w-4 h-4 mr-1" /> Trending Down</span>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    )}

      <Tabs defaultValue="reports" className="w-full">
        {!isStaff && (
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="reports">Sales Reports</TabsTrigger>
            <TabsTrigger value="revenue">Revenue Analysis</TabsTrigger>
            <TabsTrigger value="products">Product Performance</TabsTrigger>
            <TabsTrigger value="categories">Category Breakdown</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="reports" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>All Sales Reports</CardTitle>
                  <CardDescription>Manage and view all sales transactions</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  {/* Rows per page selector */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Show</span>
                    <Select
                      value={String(rowsPerPage)}
                      onValueChange={(v) => {
                        setRowsPerPage(Number(v));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="h-8 w-20 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="-1">All</SelectItem>
                      </SelectContent>
                    </Select>
                    <span>rows</span>
                  </div>
                  {/* Search */}
                  <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search reports..."
                      className="pl-10 bg-gray-50 border-gray-200"
                      value={searchTerm}
                      onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    />
                    <AnimatePresence>
                      {searchTerm && (
                        <motion.button
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          onClick={() => { setSearchTerm(""); setCurrentPage(1); }}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => handleSort("date")}
                      >
                        Date {renderSortIcon("date")}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => handleSort("orderNumber")}
                      >
                        Order # {renderSortIcon("orderNumber")}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => handleSort("product")}
                      >
                        Product {renderSortIcon("product")}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => handleSort("category")}
                      >
                        Category {renderSortIcon("category")}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => handleSort("customer")}
                      >
                        Customer {renderSortIcon("customer")}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => handleSort("quantity")}
                      >
                        Qty {renderSortIcon("quantity")}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => handleSort("unitPrice")}
                      >
                        Unit Price {renderSortIcon("unitPrice")}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => handleSort("total")}
                      >
                        Total {renderSortIcon("total")}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => handleSort("payment")}
                      >
                        Payment {renderSortIcon("payment")}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => handleSort("status")}
                      >
                        Status {renderSortIcon("status")}
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedReports.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          {(globalFilters?.searchTerm || searchTerm) ? "No reports found matching your search" : "No sales reports yet. Add your first report!"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedReports.map((report) => (
                        <motion.tr
                          key={report.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <TableCell>{new Date(report.reportDate).toLocaleDateString()}</TableCell>
                          <TableCell className="font-medium">{report.orderNumber}</TableCell>
                          <TableCell>
                            <button
                              className="text-[#FF6B00] hover:underline font-medium text-left"
                              onClick={() => handleProductClick(report.productName, report.category)}
                            >
                              {report.productName}
                            </button>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{report.category}</Badge>
                          </TableCell>
                          <TableCell>{report.customerName}</TableCell>
                          <TableCell>{report.quantity}</TableCell>
                          <TableCell>{formatCurrency(report.unitPrice)}</TableCell>
                          <TableCell className="font-semibold">{formatCurrency(report.totalAmount)}</TableCell>
                          <TableCell>{report.paymentMethod}</TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                report.status === "Completed" ? "default" : 
                                report.status === "Pending" ? "secondary" : 
                                "destructive"
                              }
                            >
                              {report.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditReport(report)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteReport(report.id)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </motion.tr>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination footer */}
              {rowsPerPage !== -1 && totalRows > 0 && (
                <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
                  <span>
                    Showing {((safeCurrentPage - 1) * rowsPerPage) + 1}–{Math.min(safeCurrentPage * rowsPerPage, totalRows)} of {totalRows.toLocaleString()} records
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => setCurrentPage(1)}
                      disabled={safeCurrentPage === 1}
                      className="h-8 w-8 p-0"
                    >«</Button>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={safeCurrentPage === 1}
                      className="h-8 w-8 p-0"
                    >‹</Button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - safeCurrentPage) <= 2)
                      .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, idx) =>
                        p === "…" ? (
                          <span key={`ellipsis-${idx}`} className="px-1">…</span>
                        ) : (
                          <Button
                            key={p}
                            variant={p === safeCurrentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(p as number)}
                            className={`h-8 w-8 p-0 ${p === safeCurrentPage ? "bg-[#FF6B00] hover:bg-[#FF6B00]/90 border-[#FF6B00]" : ""}`}
                          >
                            {p}
                          </Button>
                        )
                      )}

                    <Button
                      variant="outline" size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={safeCurrentPage === totalPages}
                      className="h-8 w-8 p-0"
                    >›</Button>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={safeCurrentPage === totalPages}
                      className="h-8 w-8 p-0"
                    >»</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      
      {!isStaff && (
        <>
        <TabsContent value="revenue" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Monthly Sales Trend</CardTitle>
                <CardDescription>Year-to-date revenue performance</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={salesTrendData}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF6B00" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#FF6B00" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: 'none', 
                        borderRadius: '8px', 
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
                      }}
                      formatter={(value: any) => [formatCurrency(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 }), 'Sales']} 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="sales" 
                      stroke="#FF6B00" 
                      strokeWidth={3}
                      fill="url(#colorSales)"
                      dot={{ fill: '#FF6B00', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Order Volume</CardTitle>
                <CardDescription>Monthly order count trends</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={salesTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: 'none', 
                        borderRadius: '8px', 
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
                      }}
                      formatter={(value: any) => [value.toLocaleString(), 'Orders']} 
                    />
                    <Bar dataKey="orders" fill="#607D8B" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="products" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Top Performing Products</CardTitle>
              <CardDescription>Best sellers by revenue and units sold</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={topProductsData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" stroke="#6b7280" />
                  <YAxis dataKey="name" type="category" width={120} stroke="#6b7280" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: 'none', 
                      borderRadius: '8px', 
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
                    }}
                    formatter={(value: any) => [formatCurrency(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 }), 'Revenue']} 
                  />
                  <Bar dataKey="revenue" fill="#FF6B00" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Sales by Category</CardTitle>
                <CardDescription>Distribution of sales across product categories</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Category Performance</CardTitle>
                <CardDescription>Detailed breakdown by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {categoryData.map((category) => (
                    <div key={category.name} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div 
                            className="w-4 h-4 rounded-full" 
                            style={{ backgroundColor: category.color }}
                          />
                          <span className="font-medium">{category.name}</span>
                        </div>
                        <span className="text-muted-foreground">{category.value}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{ 
                            width: `${category.value}%`,
                            backgroundColor: category.color
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        </>
      )}
      </Tabs>
    

      {/* Add/Edit Sales Report Modal */}
      <Dialog open={addEditModalOpen} onOpenChange={setAddEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingReport ? "Edit Sales Report" : "Add New Sales Report"}
            </DialogTitle>
            <DialogDescription>
              {editingReport ? "Update the sales report details below" : "Fill in the details to add a new sales report"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reportDate">Report Date *</Label>
              <Input
                id="reportDate"
                type="date"
                value={formData.reportDate}
                onChange={(e) => setFormData({ ...formData, reportDate: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="orderNumber">Order Number *</Label>
              <Input
                id="orderNumber"
                value={formData.orderNumber}
                onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                placeholder="ORD-12345"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="productName">Product Name *</Label>
              <Select 
                value={formData.productName} 
                onValueChange={(value: string) => {
                  const selectedItem = inventory.find(item => item.name === value);
                  if (selectedItem) {
                    setFormData({ 
                      ...formData, 
                      productName: value,
                      category: selectedItem.category, 
                      unitPrice: selectedItem.unitCost  
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product from inventory" />
                </SelectTrigger>
                <SelectContent>
                  {inventory.length > 0 ? (
                    inventory.map((item) => (
                      <SelectItem key={item.id} value={item.name}>
                        {item.name} ({item.currentStock} in stock)
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>No products in inventory</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                disabled
                className="bg-gray-100" 
                placeholder="Select a product first"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                required
              />
              {isOverStock && (
                <motion.p 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[12px] font-medium text-red-500 mt-1 flex items-center gap-1"
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> 
                  Warning: Only {selectedInvItem.currentStock} units available in stock.
                </motion.p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="unitPrice">Unit Price ({PESO_SYMBOL}) *</Label>
              <Input
                id="unitPrice"
                type="number"
                min="0"
                step="0.01"
                value={formData.unitPrice}
                onChange={(e) => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name *</Label>
              <Input
                id="customerName"
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                placeholder="Enter customer name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method *</Label>
              <Select 
                value={formData.paymentMethod} 
                onValueChange={(value: string) => setFormData({ ...formData, paymentMethod: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Credit Card">Credit Card</SelectItem>
                  <SelectItem value="Debit Card">Debit Card</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Check">Check</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value: any) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Total Amount</Label>
              <Input
                value={formatCurrency(formData.quantity * formData.unitPrice)}
                disabled
                className="bg-gray-100"
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes or comments..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEditModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitReport}
              disabled={isLoading || !formData.productName || !formData.customerName || !formData.category}
              className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]"
            >
              {isLoading ? "Saving..." : editingReport ? "Update Report" : "Add Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Sales Reports</DialogTitle>
            <DialogDescription>
              Upload an Excel (.xlsx, .xls) or CSV file to import sales reports
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Supports: Excel (.xlsx, .xls) and CSV files
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                {isLoading ? "Processing..." : "Choose File"}
              </Button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm font-medium text-blue-900 mb-2">Expected Format:</p>
              <p className="text-xs text-blue-700 mb-2">
                Your file should include these columns:
              </p>
              <p className="text-xs text-blue-700 font-mono">
                reportDate, productName, category, quantity, unitPrice, totalAmount, 
                customerName, paymentMethod, status, orderNumber, notes
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>
            <Button variant="outline" onClick={() => setImportModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the sales report
              from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revenue Modal */}
      <Dialog open={modalOpen === "revenue"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <DollarSign className="w-5 h-5 mr-2 text-[#FF6B00]" />
              Total Revenue Details
            </DialogTitle>
            <DialogDescription>Comprehensive revenue breakdown and analysis</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Card className="border-0 bg-gradient-to-br from-[#FF6B00]/10 to-[#FF8A50]/10">
              <CardContent className="pt-6">
                <div className="text-4xl font-bold mb-2 text-[#FF6B00]">{formatCurrency(totalRevenue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                <p className="text-sm text-muted-foreground">Total revenue from {totalOrders} sales transactions</p>
                <div className="mt-4 flex items-center text-sm text-green-600">
                  <ArrowUpRight className="w-4 h-4 mr-1" />
                  <span>+22.5% compared to last year</span>
                </div>
              </CardContent>
            </Card>
            
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Average Transaction</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(avgOrderValue)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Completed Sales</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{completedOrders}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {((completedOrders / totalOrders) * 100).toFixed(1)}% completion rate
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Revenue by Payment Method</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Array.from(new Set(salesReports.map(r => r.paymentMethod))).map(method => {
                    const methodRevenue = salesReports
                      .filter(r => r.paymentMethod === method)
                      .reduce((sum, r) => sum + r.totalAmount, 0);
                    const percentage = totalRevenue > 0 ? (methodRevenue / totalRevenue) * 100 : 0;
                    
                    return (
                      <div key={method} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>{method}</span>
                          <span className="font-medium">{formatCurrency(methodRevenue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ({percentage.toFixed(1)}%)</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-[#FF6B00] h-2 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Orders Modal */}
      <Dialog open={modalOpen === "orders"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <ShoppingCart className="w-5 h-5 mr-2 text-[#607D8B]" />
              Total Orders Overview
            </DialogTitle>
            <DialogDescription>Complete order history and statistics</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-0 bg-gradient-to-br from-green-50 to-green-100">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-green-700">{completedOrders}</div>
                  <p className="text-sm text-green-600">Completed</p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-gradient-to-br from-orange-50 to-orange-100">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-orange-700">
                    {salesReports.filter(r => r.status === "Pending").length}
                  </div>
                  <p className="text-sm text-orange-600">Pending</p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-gradient-to-br from-red-50 to-red-100">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-700">
                    {salesReports.filter(r => r.status === "Cancelled").length}
                  </div>
                  <p className="text-sm text-red-600">Cancelled</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {salesReports.slice(0, 5).map(report => (
                    <div key={report.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{report.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">{report.customerName}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sm">{formatCurrency(report.totalAmount)}</p>
                        <Badge variant={report.status === "Completed" ? "default" : "secondary"} className="text-xs">
                          {report.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Average Order Value Modal */}
      <Dialog open={modalOpen === "average"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Package className="w-5 h-5 mr-2 text-[#212121]" />
              Average Order Value Analysis
            </DialogTitle>
            <DialogDescription>Understanding customer purchase behavior</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Card className="border-0 bg-gradient-to-br from-gray-100 to-gray-200">
              <CardContent className="pt-6">
                <div className="text-4xl font-bold mb-2">{formatCurrency(avgOrderValue)}</div>
                <p className="text-sm text-muted-foreground">Average value per order</p>
                <div className="mt-4 flex items-center text-sm text-green-600">
                  <ArrowUpRight className="w-4 h-4 mr-1" />
                  <span>+5.3% compared to last year</span>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Highest Order</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {salesReports.length > 0 ? formatCurrency(Math.max(...salesReports.map(r => r.totalAmount))) : formatCurrency(0)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Lowest Order</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {salesReports.length > 0 ? formatCurrency(Math.min(...salesReports.map(r => r.totalAmount))) : formatCurrency(0)}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Top Customers by Order Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Array.from(new Set(salesReports.map(r => r.customerName)))
                    .map(customer => {
                      const customerOrders = salesReports.filter(r => r.customerName === customer);
                      const totalSpent = customerOrders.reduce((sum, r) => sum + r.totalAmount, 0);
                      const avgSpent = totalSpent / customerOrders.length;
                      return { customer, totalSpent, avgSpent, orderCount: customerOrders.length };
                    })
                    .sort((a, b) => b.avgSpent - a.avgSpent)
                    .slice(0, 5)
                    .map(({ customer, avgSpent, orderCount }) => (
                      <div key={customer} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{customer}</p>
                          <p className="text-xs text-muted-foreground">{orderCount} orders</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-sm">{formatCurrency(avgSpent)}</p>
                          <p className="text-xs text-muted-foreground">avg order</p>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Growth Rate Modal */}
      <Dialog open={modalOpen === "growth"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Activity className="w-5 h-5 mr-2 text-[#FFA726]" />
              Growth Rate Analysis
            </DialogTitle>
            <DialogDescription>Performance trends and growth metrics</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Card className="border-0 bg-gradient-to-br from-orange-50 to-orange-100">
              <CardContent className="pt-6">
                <div className="text-4xl font-bold mb-2 text-[#FF6B00]">+{growthRate}%</div>
                <p className="text-sm text-muted-foreground">Year-over-year growth rate</p>
                <div className="mt-4 flex items-center text-sm text-green-600">
                  <ArrowUpRight className="w-4 h-4 mr-1" />
                  <span>Above target performance</span>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Monthly Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">+8.3%</div>
                  <p className="text-xs text-muted-foreground mt-1">Compared to last month</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Quarterly Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">+12.7%</div>
                  <p className="text-xs text-muted-foreground mt-1">Q3 vs Q2 2025</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Growth by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {categoryData.map(category => (
                    <div key={category.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
                          <span>{category.name}</span>
                        </div>
                        <span className="font-medium text-green-600">+{(Math.random() * 20 + 5).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{ 
                            width: `${category.value}%`,
                            backgroundColor: category.color
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-[#FF6B00]">
              <CardContent className="pt-6">
                <div className="flex items-start space-x-3">
                  <TrendingUp className="w-5 h-5 text-[#FF6B00] mt-1" />
                  <div>
                    <h4 className="font-semibold mb-1">Growth Forecast</h4>
                    <p className="text-sm text-muted-foreground">
                      Based on current trends, projected growth for next quarter is <span className="font-semibold text-[#FF6B00]">+18.5%</span>.
                      This indicates strong market demand and effective sales strategies.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <Dialog open={productDetailModalOpen} onOpenChange={setProductDetailModalOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <Package className="w-5 h-5 mr-2 text-[#FF6B00]" />
                Product Details: {selectedProduct.productName}
              </DialogTitle>
              <DialogDescription>
                Transaction information and product statistics
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Product Information Card with Image */}
              <Card className="border-2 border-[#FF6B00]/20">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-6">
                    {/* Product Image */}
                    <div className="flex-shrink-0">
                      <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-[#FF6B00]/20 to-[#FF8A50]/20 flex items-center justify-center border-2 border-[#FF6B00]/30">
                        <Package className="w-16 h-16 text-[#FF6B00]" />
                      </div>
                    </div>

                    {/* Product Details */}
                    <div className="flex-1 space-y-3">
                      <div>
                        <h3 className="text-2xl font-bold text-[#FF6B00]">{selectedProduct.productName}</h3>
                        <Badge className="mt-2" variant="outline">{selectedProduct.category}</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <p className="text-sm text-muted-foreground">Category</p>
                          <p className="font-semibold">{selectedProduct.category}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Total Transactions</p>
                          <p className="font-semibold">{getProductStats(selectedProduct.productName).totalOrders}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Product Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  <Card className="border-0 bg-gradient-to-br from-[#FF6B00]/10 to-[#FF8A50]/10">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center">
                        <DollarSign className="w-4 h-4 mr-2 text-[#FF6B00]" />
                        Total Revenue
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-[#FF6B00]">
                        {formatCurrency(getProductStats(selectedProduct.productName).totalRevenue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        From all sales transactions
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <Card className="border-0 bg-gradient-to-br from-[#607D8B]/10 to-[#B0BEC5]/10">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center">
                        <ShoppingCart className="w-4 h-4 mr-2 text-[#607D8B]" />
                        Total Orders
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-[#607D8B]">
                        {getProductStats(selectedProduct.productName).totalOrders}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {getProductStats(selectedProduct.productName).totalQuantity} units sold
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <Card className="border-0 bg-gradient-to-br from-green-50 to-green-100">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center">
                        <Activity className="w-4 h-4 mr-2 text-green-600" />
                        Growth Rate
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-green-600 flex items-center">
                        {getProductStats(selectedProduct.productName).growthRate > 0 ? '+' : ''}
                        {getProductStats(selectedProduct.productName).growthRate.toFixed(1)}%
                        {getProductStats(selectedProduct.productName).growthRate > 0 ? (
                          <TrendingUp className="w-5 h-5 ml-2" />
                        ) : (
                          <TrendingDown className="w-5 h-5 ml-2" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Sales performance trend
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              {/* Transaction History */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Transaction History</CardTitle>
                  <CardDescription>
                    All sales transactions for this product
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {getProductStats(selectedProduct.productName).reports.map((report, index) => (
                      <motion.div
                        key={report.id}
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: index * 0.05 }}
                        className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm">{report.orderNumber}</p>
                              <Badge 
                                variant={
                                  report.status === "Completed" ? "default" : 
                                  report.status === "Pending" ? "secondary" : 
                                  "destructive"
                                }
                                className="text-xs"
                              >
                                {report.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Customer: {report.customerName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(report.reportDate).toLocaleDateString()} • {report.paymentMethod}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{formatCurrency(report.totalAmount)}</p>
                            <p className="text-xs text-muted-foreground">
                              {report.quantity} × {formatCurrency(report.unitPrice)}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Time Period Statistics */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Sales by Time Period</CardTitle>
                      <CardDescription>
                        Track product demand over time
                      </CardDescription>
                    </div>
                    <Tabs value={timePeriod} onValueChange={(v: string) => setTimePeriod(v as "weekly" | "monthly" | "yearly")} className="w-auto">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="weekly">Weekly</TabsTrigger>
                        <TabsTrigger value="monthly">Monthly</TabsTrigger>
                        <TabsTrigger value="yearly">Yearly</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {getTimePeriodStats(selectedProduct.productName, timePeriod).length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        No data available for this time period
                      </p>
                    ) : (
                      getTimePeriodStats(selectedProduct.productName, timePeriod).map((stat, index) => {
                        // Format period label
                        let periodLabel = "";
                        if (timePeriod === "weekly") {
                          periodLabel = `Week of ${new Date(stat.period).toLocaleDateString()}`;
                        } else if (timePeriod === "monthly") {
                          const [year, month] = stat.period.split('-');
                          const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                          periodLabel = `${monthNames[parseInt(month) - 1]} ${year}`;
                        } else {
                          periodLabel = stat.period;
                        }

                        // Determine if this is high demand (above average)
                        const avgOrders = getTimePeriodStats(selectedProduct.productName, timePeriod)
                          .reduce((sum, s) => sum + s.orders, 0) / getTimePeriodStats(selectedProduct.productName, timePeriod).length;
                        const isHighDemand = stat.orders > avgOrders;

                        return (
                          <motion.div
                            key={stat.period}
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: index * 0.05 }}
                            className={`p-4 rounded-lg border-2 ${
                              isHighDemand 
                                ? 'bg-green-50 border-green-200' 
                                : 'bg-gray-50 border-gray-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <p className="font-semibold">{periodLabel}</p>
                                  {isHighDemand && (
                                    <Badge className="bg-green-600 text-white">High Demand</Badge>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Total Revenue</p>
                                    <p className="text-lg font-bold text-[#FF6B00]">
                                      {formatCurrency(stat.revenue)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Total Orders</p>
                                    <p className="text-lg font-bold text-[#607D8B]">
                                      {stat.orders}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="ml-4">
                                {isHighDemand ? (
                                  <TrendingUp className="w-8 h-8 text-green-600" />
                                ) : (
                                  <Activity className="w-8 h-8 text-gray-400" />
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>


              {/* ── Forecast Chart (Python model integration) ── */}
              {(() => {
                const fc = productForecasts[selectedProduct.productName];
                const algorithm = fc?.algorithm;
                const modelDesc = algorithm ? MODEL_DESCRIPTIONS[algorithm] : null;

                // Build combined chart data: history + forecast
                const historyPoints = fc?.history ?? [];
                const forecastPoints = fc?.forecasts ?? [];
                const allPeriods = Array.from(new Set([
                  ...historyPoints.map(h => h.period),
                  ...forecastPoints.map(f => f.period)
                ])).sort();
                const fcMap: Record<string, typeof forecastPoints[0]> = {};
                forecastPoints.forEach(f => { fcMap[f.period] = f; });
                const actMap: Record<string, number> = {};
                historyPoints.forEach(h => { actMap[h.period] = h.actual; });
                const chartData = allPeriods.map(period => ({
                  period,
                  actual:    actMap[period] ?? null,
                  predicted: fcMap[period]?.predicted ?? null,
                  lower:     fcMap[period]?.lower ?? null,
                  upper:     fcMap[period]?.upper ?? null,
                  ciBottom:  fcMap[period]?.lower ?? null,
                  ciHeight:  (fcMap[period]?.upper != null && fcMap[period]?.lower != null)
                              ? (fcMap[period].upper! - fcMap[period].lower!)
                              : null,
                }));
                const lastActualPeriod = historyPoints.at(-1)?.period ?? "";

                return (
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Brain className="w-4 h-4 text-[#FF6B00]" />
                            Sales Forecast
                          </CardTitle>
                          <CardDescription>
                            Actual sales history + 6-month prediction
                          </CardDescription>
                        </div>

                        {/* Model badge + tooltip */}
                        {algorithm && (
                          <TooltipProvider>
                            <UITooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5 cursor-help">
                                  <Badge
                                    className={`text-xs px-2 py-1 ${
                                      algorithm === "ARIMA_XGB"
                                        ? "bg-purple-100 text-purple-800 border border-purple-200"
                                        : "bg-blue-100 text-blue-800 border border-blue-200"
                                    }`}
                                    variant="outline"
                                  >
                                    {algorithm === "ARIMA_XGB" ? "ARIMA + XGBoost" : "TSB + XGBoost"}
                                  </Badge>
                                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent
                                side="left"
                                className="max-w-xs text-sm leading-relaxed"
                              >
                                <p className="font-semibold mb-1">
                                  {algorithm === "ARIMA_XGB" ? "ARIMA + XGBoost" : "TSB + XGBoost"}
                                </p>
                                <p>{modelDesc}</p>
                                {fc?.demand_type && (
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Demand type: <strong>{fc.demand_type}</strong>
                                    {" "}(ADI {fc.adi?.toFixed(2)}, CV² {fc.cv2?.toFixed(2)})
                                  </p>
                                )}
                              </TooltipContent>
                            </UITooltip>
                          </TooltipProvider>
                        )}

                        {/* Refresh button */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          disabled={fc?.loading}
                          onClick={() => runForecast(selectedProduct.productName, 6)}
                        >
                          {fc?.loading ? "Running model…" : "Run Forecast"}
                        </Button>
                      </div>

                      {/* Accuracy strip */}
                      {fc?.model_info?.accuracy != null && (
                        <div className={`flex items-center gap-3 mt-3 p-3 rounded-lg border text-sm flex-wrap ${
                          fc.model_info.low_accuracy
                            ? "bg-red-50 border-red-200"
                            : "bg-gray-50 border-gray-100"
                        }`}>
                          <div>
                            <span className="text-muted-foreground">Model accuracy: </span>
                            <span className={`font-semibold ${
                              fc.model_info.accuracy >= 90 ? "text-green-600"
                              : fc.model_info.accuracy >= 75 ? "text-orange-500"
                              : "text-red-600"
                            }`}>
                              {fc.model_info.accuracy.toFixed(1)}%
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">MAPE: </span>
                            <span className="font-medium">{fc.model_info.mape?.toFixed(1)}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Trained on: </span>
                            <span className="font-medium">{fc.model_info.n_train} months</span>
                          </div>
                          {fc.model_info.retrained && (
                            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
                              fc.model_info.retrain_improved
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-yellow-50 text-yellow-700 border-yellow-200"
                            }`}>
                              ↺ {fc.model_info.retrain_improved
                                  ? `Auto-retrained ✓ (was ${fc.model_info.initial_mape?.toFixed(1)}% MAPE)`
                                  : `Auto-retrained (no improvement from ${fc.model_info.initial_mape?.toFixed(1)}% MAPE)`}
                            </div>
                          )}
                          {fc.model_info.low_accuracy && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                              <AlertTriangle className="w-3 h-3" />
                              Low accuracy — consider re-running with more data
                            </div>
                          )}
                        </div>
                      )}
                    </CardHeader>

                    <CardContent>
                      {fc?.loading ? (
                        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground gap-2">
                          <div className="w-4 h-4 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
                          Running {algorithm ?? "forecast"} model…
                        </div>
                      ) : fc?.error ? (
                        <div className="flex items-center justify-center h-48 text-sm text-red-500 gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          {fc.error}
                        </div>
                      ) : chartData.length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                          Click &quot;Run Forecast&quot; to generate predictions for this product.
                        </div>
                      ) : (
                        <>
                          {/* Legend */}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3 flex-wrap">
                            <span className="flex items-center gap-1.5">
                              <span className="inline-block w-3 h-0.5 bg-[#FF6B00] rounded" />
                              Actual sales
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="inline-block w-3 h-0.5 bg-purple-500 rounded border-dashed" style={{borderTop: "2px dashed #8b5cf6", background: "none"}} />
                              Forecast
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="inline-block w-3 h-2.5 rounded bg-purple-100 border border-purple-200" />
                              95% CI
                            </span>
                          </div>

                          <ResponsiveContainer width="100%" height={280}>
                            <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                              <defs>
                                <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.15}/>
                                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                              <XAxis
                                dataKey="period"
                                tick={{ fontSize: 10, fill: "#6b7280" }}
                                interval="preserveStartEnd"
                              />
                              <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} width={45} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: "white",
                                  border: "none",
                                  borderRadius: "8px",
                                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                                  fontSize: 12,
                                }}
                                formatter={(value: any, name: string) => {
                                  if (name === "_ciFloor" || value === null) return null;
                                  if (name === "95% CI band") return [null, null];
                                  return [
                                    typeof value === "number" ? value.toFixed(1) : value,
                                    name
                                  ];
                                }}
                                labelFormatter={(label) => `Period: ${label}`}
                              />

                              {/* CI band — stacked area trick */}
                              <Area
                                type="monotone"
                                dataKey="ciBottom"
                                stroke="none" fill="none"
                                legendType="none" name="_ciFloor"
                                stackId="ci" connectNulls
                              />
                              <Area
                                type="monotone"
                                dataKey="ciHeight"
                                stroke="none"
                                fill="url(#fcGrad)"
                                fillOpacity={1}
                                legendType="none"
                                name="95% CI band"
                                stackId="ci"
                                connectNulls
                              />

                              {/* Forecast / History split line */}
                              {lastActualPeriod && (
                                <ReferenceLine
                                  x={lastActualPeriod}
                                  stroke="#d1d5db"
                                  strokeDasharray="4 3"
                                  label={{ value: "→ Forecast", fill: "#9ca3af", fontSize: 10, position: "insideTopRight" }}
                                />
                              )}

                              {/* Actual sales line */}
                              <Line
                                type="monotone"
                                dataKey="actual"
                                name="Actual"
                                stroke="#FF6B00"
                                strokeWidth={2.5}
                                dot={(props: any) => {
                                  const { cx, cy, payload } = props;
                                  const r = payload.predicted !== null ? 5 : 3;
                                  return (
                                    <circle key={`a-${props.index}`} cx={cx} cy={cy} r={r}
                                      fill="#FF6B00" stroke="white"
                                      strokeWidth={payload.predicted !== null ? 1.5 : 0}
                                    />
                                  );
                                }}
                                connectNulls={false}
                              />

                              {/* Forecast line */}
                              <Line
                                type="monotone"
                                dataKey="predicted"
                                name="Forecast"
                                stroke="#8b5cf6"
                                strokeWidth={2}
                                strokeDasharray="5 3"
                                dot={{ r: 3, fill: "#8b5cf6", strokeWidth: 0 }}
                                connectNulls={false}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>

                          {/* Forecast values table */}
                          {forecastPoints.length > 0 && (
                            <div className="mt-4 border rounded-lg overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Period</th>
                                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Predicted</th>
                                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Lower 95%</th>
                                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Upper 95%</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {forecastPoints.map((f, i) => (
                                    <tr key={f.period} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                                      <td className="px-3 py-1.5 font-mono">{f.period}</td>
                                      <td className="px-3 py-1.5 text-right font-semibold text-purple-700">
                                        {f.predicted.toFixed(1)}
                                      </td>
                                      <td className="px-3 py-1.5 text-right text-muted-foreground">
                                        {f.lower?.toFixed(1) ?? "—"}
                                      </td>
                                      <td className="px-3 py-1.5 text-right text-muted-foreground">
                                        {f.upper?.toFixed(1) ?? "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}

            <DialogFooter>
              <Button variant="outline" onClick={() => setProductDetailModalOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </motion.div>
  );
}
