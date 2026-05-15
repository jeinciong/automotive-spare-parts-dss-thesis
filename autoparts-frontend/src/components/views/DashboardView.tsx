import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Progress } from "../ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { GlobalFilters } from "../../App";
import { motion, AnimatePresence } from "motion/react";
import { useInventory } from "../../contexts/InventoryContext";
import { useForecast } from "../../contexts/ForecastContext";
import { useSalesReports } from "../../contexts/SalesReportsContext";
import { format, isWithinInterval, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { formatCurrency } from "../../lib/currency";
import { apiUrl } from "../../lib/api";
import {
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Activity,
  Zap,
  Lightbulb,
  AlertTriangle,
  Target,
  Package,
  TrendingUp,
  TrendingDown,
  DollarSign
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell
} from "recharts";

interface DashboardViewProps {
  globalFilters?: GlobalFilters;
}

type FilterType = "all" | "today" | "weekly" | "monthly" | "yearly" | "quarterly" | "custom";

interface DateFilter {
  type: FilterType;
  quarter?: 1 | 2 | 3 | 4;
  quarterYear?: number;
  customStart?: string;
  customEnd?: string;
}

function filterByDate<T extends { reportDate?: string; date?: string }>(
  rows: T[],
  filter: DateFilter
): T[] {
  if (filter.type === "all") return rows;
  const now = new Date();
  return rows.filter((r) => {
    const dateStr = r.reportDate || r.date;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (filter.type === "today") {
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }
    if (filter.type === "weekly") {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      return d >= weekAgo && d <= now;
    }
    if (filter.type === "monthly") {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (filter.type === "yearly") {
      return d.getFullYear() === now.getFullYear();
    }
    if (filter.type === "quarterly") {
      const q = filter.quarter ?? 1;
      const y = filter.quarterYear ?? now.getFullYear();
      const startMonth = (q - 1) * 3;
      const endMonth = startMonth + 2;
      return (
        d.getFullYear() === y &&
        d.getMonth() >= startMonth &&
        d.getMonth() <= endMonth
      );
    }
    if (filter.type === "custom") {
      const start = filter.customStart ? new Date(filter.customStart) : null;
      const end = filter.customEnd ? new Date(filter.customEnd + "T23:59:59") : null;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    }
    return true;
  });
}

function DateFilterBar({
  filter,
  onChange,
}: {
  filter: DateFilter;
  onChange: (f: DateFilter) => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const baseBtn =
    "px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 border";
  const active =
    "bg-[#FF6B00] text-white border-[#FF6B00] shadow-sm";
  const inactive =
    "bg-white text-gray-600 border-gray-200 hover:border-[#FF6B00] hover:text-[#FF6B00]";

  const types: { label: string; value: FilterType }[] = [
    { label: "All", value: "all" },
    { label: "Today", value: "today" },
    { label: "This Week", value: "weekly" },
    { label: "This Month", value: "monthly" },
    { label: "This Year", value: "yearly" },
    { label: "Quarterly", value: "quarterly" },
    { label: "Custom", value: "custom" },
  ];

  return (
    <div className="flex flex-col gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 mb-4">
      {/* Filter Type Buttons */}
      <div className="flex items-center flex-wrap gap-2">
        <span className="text-sm font-medium text-gray-600 mr-1">Filter Financial Statistics by:</span>
        {types.map((t) => (
          <button
            key={t.value}
            className={`${baseBtn} ${filter.type === t.value ? active : inactive}`}
            onClick={() => onChange({ type: t.value })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Quarterly Sub-controls */}
      {filter.type === "quarterly" && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 font-medium">Quarter:</span>
            {([1, 2, 3, 4] as const).map((q) => (
              <button
                key={q}
                className={`${baseBtn} ${filter.quarter === q ? active : inactive}`}
                onClick={() =>
                  onChange({ ...filter, quarter: q, quarterYear: filter.quarterYear ?? currentYear })
                }
              >
                Q{q}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 font-medium">Year:</span>
            <select
              aria-label="Select year for quarterly filter"
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-[#FF6B00]"
              value={filter.quarterYear ?? currentYear}
              onChange={(e) =>
                onChange({ ...filter, quarterYear: Number(e.target.value) })
              }
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Custom Range Sub-controls */}
      {filter.type === "custom" && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs text-gray-500 font-medium">From:</span>
            <input
              type="date"
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-[#FF6B00]"
              value={filter.customStart ?? ""}
              onChange={(e) => onChange({ ...filter, customStart: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">To:</span>
            <input
              type="date"
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-[#FF6B00]"
              value={filter.customEnd ?? ""}
              onChange={(e) => onChange({ ...filter, customEnd: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardView({ globalFilters }: DashboardViewProps) {
  const { inventory } = useInventory();
  const { overallAccuracy, productForecasts, fetchAccuracy } = useForecast();
  const { salesReports } = useSalesReports();
  const [salesData, setSalesData] = useState<any[]>([]);
  const [selectedMetric, setSelectedMetric] = useState("revenue");
  const [financialFilter, setFinancialFilter] = useState<DateFilter>({ type: "all" });

  const costMap = useMemo(() => {
    const map = new Map<string, number>();
    inventory.forEach((item) => {
      map.set(item.name.trim().toLowerCase(), Number(item.unitCost) || 0);
    });
    return map;
  }, [inventory]);

  const getCost = (productName: string) =>
    costMap.get(productName.trim().toLowerCase()) ?? 0;
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const businessId = savedUser.business_id;

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const response = await fetch(apiUrl(`/api/sales?business_id=${businessId}`));
        const data = await response.json();
        setSalesData(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to fetch sales:", err);
      }
    };
    if (businessId) {
      fetchSales();
      fetchAccuracy();
    }
  }, [businessId, fetchAccuracy]);

  const productListFromSales = useMemo(() => {
    return Array.from(new Set(salesData.map(s => s.product_name))).filter(Boolean);
  }, [salesData]);

  useEffect(() => {
    if (productListFromSales.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % productListFromSales.length);
    }, 3500);
    return () => clearInterval(timer);
  }, [productListFromSales.length]);

  useEffect(() => {
    setCurrentPage(1);
  }, [modalOpen, showAllProducts]);

  const stats = useMemo(() => {
    const totalRev = salesData.reduce((sum, s) => sum + Number(s.total_amount), 0);
    const now = new Date();
    const thisYear = now.getFullYear();

    const curYearSales = salesData.filter(s => new Date(s.date).getFullYear() === thisYear);
    const prevYearSales = salesData.filter(s => new Date(s.date).getFullYear() === thisYear - 1);

    const curRev = curYearSales.reduce((sum, s) => sum + Number(s.total_amount), 0);
    const prevRev = prevYearSales.reduce((sum, s) => sum + Number(s.total_amount), 0);

    return {
      revenue: totalRev,
      revenueGrowth: prevRev === 0 ? 0 : ((curRev - prevRev) / prevRev) * 100,
      orders: salesData.length,
      ordersGrowth: prevYearSales.length === 0 ? 0 : ((curYearSales.length - prevYearSales.length) / prevYearSales.length) * 100,
      units: salesData.reduce((sum, s) => sum + s.quantity, 0)
    };
  }, [salesData]);

  const topProductsList = useMemo(() => {
    const productMap: Record<string, any> = {};
    salesData.forEach(s => {
      if (!productMap[s.product_name]) {
        productMap[s.product_name] = { name: s.product_name, sales: 0, revenue: 0, category: s.category };
      }
      productMap[s.product_name].sales += s.quantity;
      productMap[s.product_name].revenue += Number(s.total_amount);
    });
    return Object.values(productMap)
      .sort((a: any, b: any) => b.revenue - a.revenue)
      .map((p: any) => ({ ...p, stock: inventory.find(i => i.name === p.name)?.currentStock || 0 }));
  }, [salesData, inventory]);

  const chartData = useMemo(() => {
    const months = Array.from({ length: 10 }, (_, i) => format(subMonths(new Date(), i), "MMM")).reverse();
    return months.map(m => {
      const monthSales = salesData.filter(s => format(new Date(s.date), "MMM") === m);
      return {
        label: m,
        sales: monthSales.reduce((sum, s) => sum + Number(s.total_amount), 0),
        orders: monthSales.length,
      };
    });
  }, [salesData]);

  const categoryPerformance = useMemo(() => {
    const catMap: Record<string, number> = {};
    salesData.forEach(s => catMap[s.category] = (catMap[s.category] || 0) + Number(s.total_amount));
    const total = Object.values(catMap).reduce((a, b) => a + b, 0);
    const colors = ["#FF6B00", "#607D8B", "#212121", "#B0BEC5"];
    return Object.entries(catMap).map(([name, rev], i) => ({
      name, revenue: rev, value: total === 0 ? 0 : Math.round((rev / total) * 100), color: colors[i % colors.length]
    }));
  }, [salesData]);

  const paginateData = (data: any[]) => {
    const totalPages = Math.max(1, Math.ceil(data.length / itemsPerPage));
    const paginatedItems = data.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    return { paginatedItems, totalPages };
  };

  const PaginationControls = ({ current, total, onChange }: { current: number, total: number, onChange: (p: number) => void }) => {
    const pages = [];
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - 1 && i <= current + 1)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }

    return (
      <div className="flex items-center justify-center space-x-1 mt-6">
        <Button variant="outline" size="icon" className="w-9 h-9 rounded-xl border-gray-200" onClick={() => onChange(1)} disabled={current === 1}>«</Button>
        <Button variant="outline" size="icon" className="w-9 h-9 rounded-xl border-gray-200" onClick={() => onChange(current - 1)} disabled={current === 1}>‹</Button>
        {pages.map((p, i) => (
          typeof p === 'number' ? (
            <Button
              key={i}
              variant={current === p ? "default" : "outline"}
              className={`w-9 h-9 rounded-xl font-medium ${current === p ? "bg-[#FF6B00] hover:bg-[#FF6B00] text-white border-0 shadow-sm" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
              onClick={() => onChange(p)}
            >
              {p}
            </Button>
          ) : <span key={i} className="px-2 text-gray-400 font-bold">...</span>
        ))}
        <Button variant="outline" size="icon" className="w-9 h-9 rounded-xl border-gray-200" onClick={() => onChange(current + 1)} disabled={current === total}>›</Button>
        <Button variant="outline" size="icon" className="w-9 h-9 rounded-xl border-gray-200" onClick={() => onChange(total)} disabled={current === total}>»</Button>
      </div>
    );
  };

  const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100, damping: 10 } } };

  const currentProd = productListFromSales[currentIndex];
  const currentFC = currentProd ? productForecasts[currentProd] : null;
  const accuracyVal = currentFC?.model_info?.accuracy ?? 0;
  const hasAccuracy = currentFC?.model_info?.accuracy != null;

  const financialMetrics = useMemo(() => {
    if (!currentProd) return { totalGrossProfit: 0, totalNetIncome: 0, grossMargin: "0", netMargin: "0", isGrossLoss: false, isNetLoss: false };

    // 1. Filter sales reports by current product
    const productSales = salesReports.filter(r => r.productName === currentProd);
    // 2. Filter by date using financialFilter
    const filteredSales = filterByDate(productSales, financialFilter);

    const totalRevenue = filteredSales.reduce((sum, r) => sum + r.totalAmount, 0);
    const totalOtherExpenses = filteredSales.reduce((sum, r) => sum + (r.otherExpenses ?? 0), 0);
    const totalCOGS = filteredSales.reduce((sum, r) => sum + getCost(r.productName) * r.quantity, 0);
    
    const totalGrossProfit = totalRevenue - totalCOGS;
    const totalNetIncome = totalGrossProfit - totalOtherExpenses;
    
    const grossMargin = totalRevenue > 0 ? ((totalGrossProfit / totalRevenue) * 100).toFixed(1) : "0";
    const netMargin = totalRevenue > 0 ? ((totalNetIncome / totalRevenue) * 100).toFixed(1) : "0";

    return {
      totalGrossProfit,
      totalNetIncome,
      grossMargin,
      netMargin,
      isGrossLoss: totalGrossProfit < 0,
      isNetLoss: totalNetIncome < 0
    };
  }, [currentProd, salesReports, financialFilter, costMap]);

  return (
    <motion.div className="space-y-6" initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.05 } } }}>

      {/* Header */}
      <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#212121] via-[#607D8B] to-[#FF6B00] p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 h-32 w-32 rounded-full bg-white/10 blur-3xl"></div>
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-2"><Calendar className="w-5 h-5" /> <span>{format(new Date(), "EEEE, MMMM dd, yyyy")}</span></div>
            <h1 className="text-white mb-2 text-3xl">Dashboard Overview</h1>
            <p className="text-[#B0BEC5] text-lg">Automotive parts business analytics and performance insights.</p>
          </div>
          {/* <Button variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border-0" onClick={() => window.dispatchEvent(new CustomEvent('updateFilters', { detail: { dateRange: 'thisWeek' }}))}><Calendar className="w-4 h-4 mr-2" /> This Week</Button> */}
        </div>
      </motion.div>

      {/* Accuracy Slideshow UI */}
      <motion.div variants={itemVariants}>
        <DateFilterBar filter={financialFilter} onChange={setFinancialFilter} />

        <div className="p-4 rounded-lg border shadow-sm bg-white border-gray-100 min-h-[95px] flex items-center">
          <div className="flex w-full">
            <div className="flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div key={currentProd || 'empty'} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.5 }} className="flex flex-col md:flex-row items-center gap-6 w-full">
                  
                  {/* Left Side: Forecast Accuracy */}
                  <div className="flex items-center space-x-4 flex-1 border-b md:border-b-0 md:border-r border-gray-100 pb-4 md:pb-0 md:pr-6 w-full">
                    <Target className="w-6 h-6 text-[#FF6B00] flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Forecast Accuracy: <span className="text-muted-foreground ml-1">{currentProd || "Calculating..."}</span></p>
                      <div className={`text-xl font-medium mt-0.5 ${hasAccuracy ? (accuracyVal >= 75 ? "text-green-600" : "text-red-600") : "text-gray-400 text-sm italic"}`}>
                        {hasAccuracy ? `${accuracyVal.toFixed(1)}%` : "Not yet available"}
                      </div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden mt-2 w-full max-w-lg">
                        <motion.div className="h-full bg-[#FF6B00]" initial={{ width: 0 }} animate={{ width: `${accuracyVal}%` }} transition={{ duration: 1 }} />
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Gross Profit and Net Income */}
                  <div className="flex-1 grid grid-cols-2 gap-4 w-full">
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex flex-col justify-center">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-600">Gross Profit</span>
                        <div className={`p-1.5 rounded-lg shadow-sm ${financialMetrics.isGrossLoss ? "bg-gradient-to-br from-red-500 to-red-700" : "bg-gradient-to-br from-[#FF6B00] to-[#FF8A50]"}`}>
                          <Activity className="w-3 h-3 text-white" />
                        </div>
                      </div>
                      <div className={`text-lg font-bold ${financialMetrics.isGrossLoss ? "text-red-600" : "text-green-600"}`}>
                        {formatCurrency(financialMetrics.totalGrossProfit)}
                      </div>
                      <p className={`text-[10px] mt-0.5 ${!financialMetrics.isGrossLoss ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                        {!financialMetrics.isGrossLoss ? <TrendingUp className="w-2.5 h-2.5 mr-1" /> : <TrendingDown className="w-2.5 h-2.5 mr-1" />}
                        {financialMetrics.isGrossLoss ? `⚠ LOSS — ${financialMetrics.grossMargin}%` : `${financialMetrics.grossMargin}% gross margin`}
                      </p>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex flex-col justify-center">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-600">Net Income</span>
                        <div className={`p-1.5 rounded-lg shadow-sm ${financialMetrics.isNetLoss ? "bg-gradient-to-br from-red-500 to-red-700" : "bg-gradient-to-br from-[#FF6B00] to-[#FF8A50]"}`}>
                          <DollarSign className="w-3 h-3 text-white" />
                        </div>
                      </div>
                      <div className={`text-lg font-bold ${financialMetrics.isNetLoss ? "text-red-600" : "text-green-600"}`}>
                        {formatCurrency(financialMetrics.totalNetIncome)}
                      </div>
                      <p className={`text-[10px] mt-0.5 ${!financialMetrics.isNetLoss ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                        {!financialMetrics.isNetLoss ? <TrendingUp className="w-2.5 h-2.5 mr-1" /> : <TrendingDown className="w-2.5 h-2.5 mr-1" />}
                        {financialMetrics.isNetLoss ? `⚠ LOSS — ${financialMetrics.netMargin}%` : `${financialMetrics.netMargin}% net margin`}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Total Revenue", val: formatCurrency(stats.revenue), growth: stats.revenueGrowth, isCurrency: true, id: "revenue", col: "from-[#FF6B00]/20 to-[#FF8A50]/20", grad: "from-[#FF6B00] to-[#FF8A50]", showProgress: false },
          { label: "Total Orders", val: stats.orders, growth: stats.ordersGrowth, icon: ShoppingCart, id: "orders", col: "from-[#607D8B]/20 to-[#B0BEC5]/20", grad: "from-[#607D8B] to-[#B0BEC5]", showProgress: false },
          { label: "Units Sold", val: stats.units, growth: null, icon: Package, id: "units", col: "from-[#FFA726]/20 to-[#FF6B00]/20", grad: "from-[#FFA726] to-[#FF6B00]", showProgress: true }
        ].map((item) => (
          <motion.div key={item.id} variants={itemVariants} whileHover={{ scale: 1.02 }} onClick={() => setModalOpen(item.id)}>
            <Card className="relative overflow-hidden border-0 shadow-lg group cursor-pointer h-full">
              <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${item.col} rounded-full blur-2xl group-hover:scale-110 transition-transform`}></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
                <div className={`p-2 bg-gradient-to-br ${item.grad} rounded-lg text-white w-8 h-8 flex items-center justify-center`}>
                  {item.isCurrency ? <span className="text-xs font-bold">₱</span> : item.icon && <item.icon className="h-4 w-4" />}
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl mb-1">{typeof item.val === 'number' ? item.val.toLocaleString() : item.val}</div>
                {item.growth !== null ? (
                  <div className={`flex items-center text-sm ${item.growth >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {item.growth >= 0 ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
                    <span>{Math.abs(item.growth).toFixed(1)}% vs last year</span>
                  </div>
                ) : <div className="text-xs text-muted-foreground">Cumulative performance</div>}
                {item.showProgress && <Progress value={80} className="mt-3 h-1.5" />}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Analytics & Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <motion.div variants={itemVariants}>
            <Card className="border-0 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Business Analytics</CardTitle>
                <Tabs value={selectedMetric} onValueChange={setSelectedMetric}>
                  <TabsList>
                    <TabsTrigger value="revenue">Revenue</TabsTrigger>
                    <TabsTrigger value="orders">Orders</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={chartData}>
                    <defs><linearGradient id="colorMain" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FF6B00" stopOpacity={0.3} /><stop offset="95%" stopColor="#FF6B00" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="label" stroke="#888" fontSize={12} axisLine={false} tickLine={false} />
                    <YAxis stroke="#888" fontSize={12} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey={selectedMetric === 'revenue' ? 'sales' : 'orders'} stroke="#FF6B00" strokeWidth={3} fill="url(#colorMain)" dot={{ fill: '#FF6B00', r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="border-0 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between">
                <div><CardTitle>Top Performing Products</CardTitle><CardDescription>High revenue contribution items</CardDescription></div>
                <Button variant="outline" size="sm" onClick={() => setShowAllProducts(true)}>View All <ArrowUpRight className="w-4 h-4 ml-1" /></Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topProductsList.slice(0, 5).map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-100">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#FF6B00] to-[#FF8A50] text-white flex items-center justify-center font-bold">#{i + 1}</div>
                        <div><p className="font-medium text-sm">{p.name}</p><p className="text-xs text-muted-foreground">{p.sales} units sold</p></div>
                      </div>
                      <div className="flex items-center space-x-8">
                        <div className="text-right"><p className="font-bold text-sm">{formatCurrency(p.revenue)}</p><p className="text-[10px] text-muted-foreground">Revenue</p></div>
                        {/* <div className="w-24"><p className="text-[10px] text-muted-foreground mb-1">Stock Level</p><Progress value={(p.stock / 100) * 100} className="h-1.5" /></div> */}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <motion.div variants={itemVariants} className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader><CardTitle>Category Split</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={categoryPerformance} innerRadius={50} outerRadius={70} dataKey="revenue" paddingAngle={5}>{categoryPerformance.map((entry, index) => <Cell key={index} fill={entry.color} />)}</Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {categoryPerformance.map((c, i) => (
                  <div key={i} className="flex justify-between text-xs font-medium"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />{c.name}</div><span>{c.value}%</span></div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg min-h-[310px]">
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle>Recent Activity</CardTitle><Activity className="w-4 h-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className="space-y-6">
                {salesData.slice(0, 5).map((sale, i) => (
                  <div key={i} className="flex items-start space-x-3">
                    <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0"><ShoppingCart className="w-3.5 h-3.5 text-[#FF6B00]" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">Order #{sale.order_number}</p>
                      <p className="text-[10px] text-muted-foreground font-bold">{format(new Date(sale.date), "MMM dd, yyyy")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* AI Recommendations Footer */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50] p-6 flex justify-between items-center text-white">
            <div className="flex items-center gap-3">
              <Lightbulb className="w-6 h-6" />
              <div><CardTitle className="text-white">AI Recommendations</CardTitle><p className="text-xs opacity-90">Decision support driven by current data</p></div>
            </div>
            <Button variant="outline" className="bg-white text-[#FF6B00] border-0" onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'recommendations' }))}>View Recommendation <ArrowUpRight className="w-4 h-4 ml-1" /></Button>
          </div>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-red-50 border border-red-100 flex gap-3">
              <AlertTriangle className="text-red-600 flex-shrink-0" />
              <div><h4 className="text-sm font-bold text-red-900">Critical Stock</h4><p className="text-xs text-red-700">{inventory.filter(i => i.status === "Critical").length} items critical.</p></div>
            </div>
            <div className="p-4 rounded-lg bg-green-50 border border-green-100 flex gap-3">
              <TrendingUp className="text-green-600 flex-shrink-0" />
              <div><h4 className="text-sm font-bold text-green-900">Top Product</h4><p className="text-xs text-green-700">{topProductsList[0]?.name || "N/A"} is leading.</p></div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* --- ALL PAGINATED MODALS --- */}

      {/* Primary KPI Modal */}
      <Dialog open={!!modalOpen} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] rounded-3xl overflow-hidden p-0 flex flex-col">
          <div className="p-6 pb-2">
            <DialogHeader>
              <DialogTitle className="capitalize text-2xl flex items-center gap-2">
                <Activity className="w-6 h-6 text-[#FF6B00]" />
                {modalOpen?.replace(/([A-Z])/g, ' $1')} Details
              </DialogTitle>
              <DialogDescription>Viewing records for {modalOpen}.</DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 flex-1 overflow-hidden">
            <div className="border border-gray-100 rounded-2xl overflow-hidden">
              <Table className="table-fixed w-full border-collapse">
                <TableHeader className="bg-gray-50/50">
                  <TableRow>
                    <TableHead className="w-[100px] font-bold text-xs">Date</TableHead>
                    <TableHead className="font-bold text-xs">Reference</TableHead>
                    <TableHead className="w-[150px] font-bold text-xs">Category</TableHead>
                    {modalOpen !== "orders" && modalOpen !== "customers" && (
                      <TableHead className="w-[100px] text-right font-bold text-xs">Metric</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    let dataSource = salesData;
                    if (modalOpen === "customers") {
                      dataSource = Array.from(new Set(salesData.map(s => s.customer_type))).map(type => ({
                        date: salesData.find(s => s.customer_type === type)?.date,
                        product_name: type,
                        category: "Customer Group",
                        total_amount: "Active"
                      }));
                    }
                    const { paginatedItems } = paginateData(dataSource);
                    return paginatedItems.map((item: any, i: number) => (
                      <TableRow key={i} className="hover:bg-orange-50/30 border-b last:border-0">
                        <TableCell className="text-[11px] text-gray-500 truncate">
                          {item.date ? format(new Date(item.date), "MMM dd, yyyy") : "N/A"}
                        </TableCell>
                        <TableCell className="font-semibold text-xs truncate">
                          {modalOpen === "revenue" || modalOpen === "orders" ? `Order #${item.order_number}` : item.product_name}
                        </TableCell>
                        <TableCell className="truncate">
                          <Badge variant="secondary" className="text-[9px] py-0 px-1 truncate max-w-full">
                            {item.category || "General"}
                          </Badge>
                        </TableCell>

                        {modalOpen !== "orders" && modalOpen !== "customers" && (
                          <TableCell className="text-right font-bold text-xs truncate">
                            {modalOpen === "revenue" ? formatCurrency(item.total_amount) :
                              modalOpen === "units" ? `${item.quantity} units` :
                                "Processed"}
                          </TableCell>
                        )}
                      </TableRow>
                    ));
                  })()}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="p-6 pt-2">
            {(() => {
              const dataCount = modalOpen === "customers" ? new Set(salesData.map(s => s.customer_type)).size : salesData.length;
              const total = Math.ceil(dataCount / itemsPerPage);
              return <PaginationControls current={currentPage} total={total || 1} onChange={setCurrentPage} />;
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Top Products Modal */}
      <Dialog open={showAllProducts} onOpenChange={setShowAllProducts}>
        <DialogContent className="max-w-5xl max-h-[85vh] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Package className="w-6 h-6 text-[#FF6B00]" /> Inventory Performance
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-hidden border border-gray-100 rounded-2xl">
            <Table className="table-fixed w-full">
              <TableHeader className="bg-gray-50/50">
                <TableRow>
                  <TableHead className="w-20 font-bold">Rank</TableHead>
                  <TableHead className="font-bold">Product</TableHead>
                  <TableHead className="w-[120px] font-bold">Units Sold</TableHead>
                  <TableHead className="w-[140px] font-bold">Revenue</TableHead>
                  <TableHead className="w-[180px] font-bold">Stock Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginateData(topProductsList).paginatedItems.map((p, i) => (
                  <TableRow key={i} className="hover:bg-orange-50/30">
                    <TableCell className="font-extrabold text-[#FF6B00]">#{(currentPage - 1) * itemsPerPage + i + 1}</TableCell>
                    <TableCell className="font-semibold truncate">{p.name}</TableCell>
                    <TableCell className="truncate">{p.sales} units</TableCell>
                    <TableCell className="font-bold text-green-600 truncate">{formatCurrency(p.revenue)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-gray-400 truncate"><span>{p.stock} stock</span></div>
                        <Progress value={Math.min((p.stock / 100) * 100, 100)} className="h-1.5" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationControls current={currentPage} total={paginateData(topProductsList).totalPages} onChange={setCurrentPage} />
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}
