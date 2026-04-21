import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Progress } from "../ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { GlobalFilters } from "../../App";
import { motion } from "motion/react";
import { useInventory } from "../../contexts/InventoryContext";
import { useForecast } from "../../contexts/ForecastContext";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subDays, subWeeks, subMonths, subQuarters, subYears, format, isWithinInterval, parseISO } from "date-fns";
import { formatCurrency } from "../../lib/currency";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Package, 
  ShoppingCart,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Activity,
  BarChart3,
  Zap,
  X,
  Lightbulb,
  AlertTriangle,
  Target
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell
} from "recharts";

// Modern gradient color schemes
const gradients = {
  blue: "from-blue-500 to-cyan-500",
  purple: "from-purple-500 to-pink-500",
  green: "from-green-500 to-emerald-500",
  orange: "from-orange-500 to-red-500",
};

const salesTrendData = [
  { month: "Jan", sales: 42000, orders: 520, customers: 380 },
  { month: "Feb", sales: 45000, orders: 550, customers: 410 },
  { month: "Mar", sales: 48000, orders: 580, customers: 445 },
  { month: "Apr", sales: 52000, orders: 610, customers: 490 },
  { month: "May", sales: 49000, orders: 595, customers: 470 },
  { month: "Jun", sales: 55000, orders: 640, customers: 520 },
  { month: "Jul", sales: 61000, orders: 690, customers: 580 },
  { month: "Aug", sales: 58000, orders: 665, customers: 555 },
  { month: "Sep", sales: 64000, orders: 720, customers: 610 },
  { month: "Oct", sales: 68500, orders: 755, customers: 645 },
];

const categoryPerformance = [
  { name: "Engine Parts", value: 35, color: "#FF6B00", revenue: 87500 },
  { name: "Brake System", value: 28, color: "#607D8B", revenue: 70000 },
  { name: "Filters", value: 22, color: "#212121", revenue: 55000 },
  { name: "Electrical", value: 15, color: "#B0BEC5", revenue: 37500 },
];

const topProducts = [
  { name: "Ceramic Brake Pads", sales: 425, trend: "+12%", revenue: 42500, stock: 75, category: "Brake System" },
  { name: "Premium Oil Filter", sales: 380, trend: "+8%", revenue: 19000, stock: 45, category: "Filters" },
  { name: "Platinum Spark Plugs", sales: 320, trend: "+15%", revenue: 16000, stock: 92, category: "Engine Parts" },
  { name: "Air Filter", sales: 280, trend: "+5%", revenue: 14000, stock: 68, category: "Filters" },
  { name: "Brake Rotors", sales: 185, trend: "-3%", revenue: 37000, stock: 28, category: "Brake System" },
  { name: "Engine Oil 5W-30", sales: 165, trend: "+10%", revenue: 8250, stock: 120, category: "Engine Parts" },
  { name: "Windshield Wipers", sales: 145, trend: "+6%", revenue: 4350, stock: 85, category: "Accessories" },
  { name: "Battery 12V", sales: 120, trend: "+18%", revenue: 18000, stock: 32, category: "Electrical" },
];

const allRevenueData = [
  { month: "Jan", amount: 42000, transactions: 245, avgOrder: 171 },
  { month: "Feb", amount: 45000, transactions: 268, avgOrder: 168 },
  { month: "Mar", amount: 48000, transactions: 289, avgOrder: 166 },
  { month: "Apr", amount: 52000, transactions: 312, avgOrder: 167 },
  { month: "May", amount: 49000, transactions: 298, avgOrder: 164 },
  { month: "Jun", amount: 55000, transactions: 334, avgOrder: 165 },
  { month: "Jul", amount: 61000, transactions: 368, avgOrder: 166 },
  { month: "Aug", amount: 58000, transactions: 351, avgOrder: 165 },
  { month: "Sep", amount: 64000, transactions: 387, avgOrder: 165 },
  { month: "Oct", amount: 68500, transactions: 412, avgOrder: 166 },
];

const allOrdersData = [
  { orderId: "ORD-1847", customer: "ABC Motors", amount: 1245, date: "2025-10-20", status: "Completed" },
  { orderId: "ORD-1846", customer: "AutoZone Services", amount: 892, date: "2025-10-20", status: "Processing" },
  { orderId: "ORD-1845", customer: "Quick Fix Auto", amount: 2150, date: "2025-10-19", status: "Completed" },
  { orderId: "ORD-1844", customer: "Elite Motors", amount: 675, date: "2025-10-19", status: "Completed" },
  { orderId: "ORD-1843", customer: "Pro Auto Parts", amount: 1520, date: "2025-10-18", status: "Completed" },
];

const allCustomersData = [
  { name: "ABC Motors", orders: 45, revenue: 56250, lastOrder: "2025-10-20", status: "Active" },
  { name: "AutoZone Services", orders: 38, revenue: 47500, lastOrder: "2025-10-20", status: "Active" },
  { name: "Quick Fix Auto", orders: 32, revenue: 42000, lastOrder: "2025-10-19", status: "Active" },
  { name: "Elite Motors", orders: 28, revenue: 35000, lastOrder: "2025-10-19", status: "Active" },
  { name: "Pro Auto Parts", orders: 25, revenue: 31250, lastOrder: "2025-10-18", status: "Active" },
];

const allUnitsData = [
  { product: "Ceramic Brake Pads", units: 425, revenue: 42500, growth: "+12%" },
  { product: "Premium Oil Filter", units: 380, revenue: 19000, growth: "+8%" },
  { product: "Platinum Spark Plugs", units: 320, revenue: 16000, growth: "+15%" },
  { product: "Air Filter", units: 280, revenue: 14000, growth: "+5%" },
  { product: "Brake Rotors", units: 185, revenue: 37000, growth: "-3%" },
];

const recentActivity = [
  { action: "New order", detail: `Order #1847 - ${formatCurrency(1245, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, time: "2 min ago", type: "order" },
  { action: "Low stock alert", detail: "Brake Pads - 25 units left", time: "15 min ago", type: "alert" },
  { action: "Customer registered", detail: "AutoZone Services", time: "1 hour ago", type: "customer" },
  { action: "Payment received", detail: `${formatCurrency(8750, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} from ABC Motors`, time: "2 hours ago", type: "payment" },
];

interface DashboardViewProps {
  globalFilters?: GlobalFilters;
}

// Utility function to generate analytics data based on filters
function generateAnalyticsData(analyticsView: "daily" | "weekly" | "monthly" | "quarterly" | "annually") {
  const baseData = salesTrendData;
  
  switch (analyticsView) {
    case "daily":
      return Array.from({ length: 30 }, (_, i) => ({
        label: `Day ${i + 1}`,
        sales: 2000 + Math.random() * 1500,
        orders: 15 + Math.floor(Math.random() * 10),
        customers: 10 + Math.floor(Math.random() * 8)
      }));
    case "weekly":
      return Array.from({ length: 12 }, (_, i) => ({
        label: `Week ${i + 1}`,
        sales: 14000 + Math.random() * 7000,
        orders: 150 + Math.floor(Math.random() * 50),
        customers: 100 + Math.floor(Math.random() * 40)
      }));
    case "quarterly":
      return [
        { label: "Q1 2025", sales: 135000, orders: 1650, customers: 1235 },
        { label: "Q2 2025", sales: 156000, orders: 1845, customers: 1530 },
        { label: "Q3 2025", sales: 183000, orders: 2075, customers: 1745 },
        { label: "Q4 2025", sales: 68500, orders: 755, customers: 645 }
      ];
    case "annually":
      return [
        { label: "2021", sales: 420000, orders: 5200, customers: 3800 },
        { label: "2022", sales: 510000, orders: 6100, customers: 4500 },
        { label: "2023", sales: 585000, orders: 6850, customers: 5200 },
        { label: "2024", sales: 640000, orders: 7320, customers: 5800 },
        { label: "2025", sales: 542500, orders: 6325, customers: 5155 }
      ];
    default: // monthly
      return baseData.map(item => ({
        label: item.month,
        sales: item.sales,
        orders: item.orders,
        customers: item.customers
      }));
  }
}


export function DashboardView({ globalFilters }: DashboardViewProps) {
  const { inventory } = useInventory();
  const { overallAccuracy, accuracyLoading, fetchAccuracy } = useForecast();
  const [selectedPeriod, setSelectedPeriod] = useState("week");
  const [selectedMetric, setSelectedMetric] = useState("revenue");
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);

  // Fetch real forecast accuracy on mount
  useEffect(() => {
    fetchAccuracy();
  }, [fetchAccuracy]);

  // Refresh accuracy whenever any product forecast completes
  useEffect(() => {
    const handler = (e: Event) => {
      const acc = (e as CustomEvent).detail;
      if (acc && typeof acc.accuracy !== "undefined") {
        // fetchAccuracy will re-query the backend; the event is a signal only
        fetchAccuracy();
      }
    };
    window.addEventListener("forecastAccuracyUpdated", handler);
    return () => window.removeEventListener("forecastAccuracyUpdated", handler);
  }, [fetchAccuracy]);

  // Calculate dynamic stats from inventory
  const totalItems = inventory.length;
  const totalValue = inventory.reduce((sum, item) => sum + (item.currentStock * item.unitCost), 0);

  // Generate data based on analytics view filter
  const chartData = useMemo(() => {
    if (!globalFilters) return salesTrendData;
    return generateAnalyticsData(globalFilters.analyticsView);
  }, [globalFilters?.analyticsView]);

  // Handle "This Week" button click
  const handleThisWeekClick = () => {
    if (globalFilters) {
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
      
      // Update filters to show this week
      window.dispatchEvent(new CustomEvent('updateFilters', {
        detail: {
          dateRange: 'custom',
          customDateRange: { from: weekStart, to: weekEnd }
        }
      }));
    }
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
      {/* Header Section with Gradient */}
      <motion.div
        variants={itemVariants}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#212121] via-[#607D8B] to-[#FF6B00] p-8 text-white shadow-xl"
      >
        <div className="absolute top-0 right-0 -mt-4 -mr-4 h-32 w-32 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-4 -ml-4 h-32 w-32 rounded-full bg-white/10 blur-3xl"></div>
        
        <div className="relative flex items-center justify-between">
          <div>
            <motion.div
              className="flex items-center space-x-2 mb-2"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <Calendar className="w-5 h-5" />
              <span className="text-[#B0BEC5]">Monday, October 20, 2025</span>
            </motion.div>
            <motion.h1
              className="text-white mb-2"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Dashboard Overview
            </motion.h1>
            <motion.p
              className="text-[#B0BEC5] text-lg"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Welcome back! Here's what's happening with your automotive parts business today.
            </motion.p>
          </div>
          
          <motion.div
            className="flex space-x-2"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <Button 
              variant="secondary" 
              className="bg-white/20 hover:bg-white/30 text-white border-0"
              onClick={handleThisWeekClick}
            >
              <Calendar className="w-4 h-4 mr-2" />
              This Week
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Forecast Confidence Indication — live-updates after every product forecast */}
      <motion.div variants={itemVariants}>
        <div className={`p-4 rounded-lg border shadow-sm transition-all duration-300 ${
          overallAccuracy?.accuracy != null && overallAccuracy.accuracy < 75
            ? "bg-gradient-to-r from-red-50 to-orange-50 border-red-200"
            : "bg-gradient-to-r from-gray-50 to-white border-gray-100"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Target className={`w-5 h-5 flex-shrink-0 ${
                overallAccuracy?.accuracy != null && overallAccuracy.accuracy < 75
                  ? "text-red-500" : "text-[#FF6B00]"
              }`} />
              <div>
                {accuracyLoading ? (
                  <p className="text-sm font-medium text-muted-foreground animate-pulse">
                    Updating forecast accuracy…
                  </p>
                ) : overallAccuracy?.accuracy != null ? (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">
                        Forecast Accuracy:{" "}
                        <span className={
                          overallAccuracy.accuracy >= 90 ? "text-green-600"
                          : overallAccuracy.accuracy >= 75 ? "text-orange-500"
                          : "text-red-600"
                        }>
                          {overallAccuracy.accuracy}%
                        </span>
                      </p>
                      {overallAccuracy.accuracy < 75 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                          <AlertTriangle className="w-3 h-3" />
                          Low accuracy — re-run forecasts
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      MAPE {overallAccuracy.mape?.toFixed(1)}% across {overallAccuracy.pairs} verified forecast period{overallAccuracy.pairs !== 1 ? "s" : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">Forecast Accuracy</p>
                    <p className="text-xs text-muted-foreground">
                      Run a forecast on any product to compute accuracy
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-[#FF6B00]">
                {overallAccuracy?.pairs
                  ? `${overallAccuracy.pairs} forecast period${overallAccuracy.pairs !== 1 ? "s" : ""} verified`
                  : "Python models: ARIMA+XGB · TSB+XGB"}
              </p>
              <p className="text-xs text-muted-foreground">
                {overallAccuracy?.accuracy != null
                  ? "ADI/CV² demand classification active · updates live"
                  : "Go to Sales Reports → click a product to forecast"}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Modern KPI Cards - Now Clickable */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        variants={containerVariants}
      >
        {/* Revenue Card */}
        <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Card 
            className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 group cursor-pointer"
            onClick={() => setModalOpen("revenue")}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#FF6B00]/20 to-[#FF8A50]/20 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Total Revenue</CardTitle>
              <motion.div
                className="p-2 bg-gradient-to-br from-[#FF6B00] to-[#FF8A50] rounded-lg"
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
              >
                <DollarSign className="h-4 w-4 text-white" />
              </motion.div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">{formatCurrency(248500, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
              <div className="flex items-center text-sm text-green-600">
                <ArrowUpRight className="w-4 h-4 mr-1" />
                <span>+12.5% from last month</span>
              </div>
              <Progress value={75} className="mt-3 h-2" />
            </CardContent>
          </Card>
        </motion.div>

        {/* Orders Card */}
        <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Card 
            className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 group cursor-pointer"
            onClick={() => setModalOpen("orders")}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#607D8B]/20 to-[#B0BEC5]/20 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Total Orders</CardTitle>
              <motion.div
                className="p-2 bg-gradient-to-br from-[#607D8B] to-[#B0BEC5] rounded-lg"
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
              >
                <ShoppingCart className="h-4 w-4 text-white" />
              </motion.div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">1,847</div>
              <div className="flex items-center text-sm text-green-600">
                <ArrowUpRight className="w-4 h-4 mr-1" />
                <span>+8.2% from last month</span>
              </div>
              <Progress value={82} className="mt-3 h-2" />
            </CardContent>
          </Card>
        </motion.div>

        {/* Customers Card */}
        <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Card 
            className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 group cursor-pointer"
            onClick={() => setModalOpen("customers")}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#212121]/20 to-[#424242]/20 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Active Customers</CardTitle>
              <motion.div
                className="p-2 bg-gradient-to-br from-[#212121] to-[#424242] rounded-lg"
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
              >
                <Users className="h-4 w-4 text-white" />
              </motion.div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">645</div>
              <div className="flex items-center text-sm text-green-600">
                <ArrowUpRight className="w-4 h-4 mr-1" />
                <span>+18.3% from last month</span>
              </div>
              <Progress value={68} className="mt-3 h-2" />
            </CardContent>
          </Card>
        </motion.div>

        {/* Units Sold Card */}
        <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Card 
            className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 group cursor-pointer"
            onClick={() => setModalOpen("units")}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#FFA726]/20 to-[#FF6B00]/20 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Units Sold</CardTitle>
              <motion.div
                className="p-2 bg-gradient-to-br from-[#FFA726] to-[#FF6B00] rounded-lg"
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
              >
                <Package className="h-4 w-4 text-white" />
              </motion.div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">12,842</div>
              <div className="flex items-center text-sm text-green-600">
                <ArrowUpRight className="w-4 h-4 mr-1" />
                <span>+15.7% from last month</span>
              </div>
              <Progress value={87} className="mt-3 h-2" />
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Charts Section */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-6" variants={containerVariants}>
        {/* Main Sales Chart - Takes 2 columns */}
        <motion.div className="lg:col-span-2" variants={itemVariants}>
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Revenue Analytics</CardTitle>
                  <CardDescription>
                    {globalFilters?.analyticsView?.charAt(0).toUpperCase() + (globalFilters?.analyticsView?.slice(1) || 'Monthly')} performance overview
                  </CardDescription>
                </div>
                <Tabs value={selectedMetric} onValueChange={setSelectedMetric} className="w-auto">
                  <TabsList>
                    <TabsTrigger value="revenue">Revenue</TabsTrigger>
                    <TabsTrigger value="orders">Orders</TabsTrigger>
                    <TabsTrigger value="customers">Customers</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF6B00" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#FF6B00" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#607D8B" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#607D8B" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCustomers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#212121" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#212121" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: 'none', 
                      borderRadius: '8px', 
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
                    }}
                    formatter={(value) => {
                      if (selectedMetric === 'revenue') {
                        return [formatCurrency(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 }), 'Sales'];
                      } else if (selectedMetric === 'orders') {
                        return [value.toLocaleString(), 'Orders'];
                      } else {
                        return [value.toLocaleString(), 'Customers'];
                      }
                    }} 
                  />
                  {selectedMetric === 'revenue' && (
                    <Area 
                      type="monotone" 
                      dataKey="sales" 
                      stroke="#FF6B00" 
                      strokeWidth={3}
                      fill="url(#colorRevenue)"
                      dot={{ fill: '#FF6B00', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                  {selectedMetric === 'orders' && (
                    <Area 
                      type="monotone" 
                      dataKey="orders" 
                      stroke="#607D8B" 
                      strokeWidth={3}
                      fill="url(#colorOrders)"
                      dot={{ fill: '#607D8B', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                  {selectedMetric === 'customers' && (
                    <Area 
                      type="monotone" 
                      dataKey="customers" 
                      stroke="#212121" 
                      strokeWidth={3}
                      fill="url(#colorCustomers)"
                      dot={{ fill: '#212121', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Category Performance */}
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Category Split</CardTitle>
              <CardDescription>Sales distribution by category</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={categoryPerformance}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryPerformance.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: 'none', 
                      borderRadius: '8px', 
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-4">
                {categoryPerformance.map((category, index) => (
                  <motion.div
                    key={index}
                    className="flex items-center justify-between"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }}></div>
                      <span className="text-sm">{category.name}</span>
                    </div>
                    <span className="text-sm font-medium">{category.value}%</span>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Bottom Section */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-6" variants={containerVariants}>
        {/* Top Products - Takes 2 columns */}
        <motion.div className="lg:col-span-2" variants={itemVariants}>
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Top Performing Products</CardTitle>
                  <CardDescription>Best sellers this month</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowAllProducts(true)}>
                  View All
                  <ArrowUpRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topProducts.slice(0, 5).map((product, index) => (
                  <motion.div
                    key={index}
                    className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-gray-50 to-white hover:shadow-md transition-shadow"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="flex items-center space-x-4 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#FF6B00] to-[#FF8A50] flex items-center justify-center text-white">
                        #{index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-muted-foreground">{product.sales} units sold</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-6">
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(product.revenue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                        <p className="text-sm text-muted-foreground">Revenue</p>
                      </div>
                      
                      <div className="text-right">
                        <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          product.trend.startsWith('+') 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {product.trend.startsWith('+') ? (
                            <TrendingUp className="w-3 h-3 mr-1" />
                          ) : (
                            <TrendingDown className="w-3 h-3 mr-1" />
                          )}
                          {product.trend}
                        </div>
                      </div>
                      
                      <div className="w-20">
                        <p className="text-sm text-muted-foreground mb-1">Stock</p>
                        <Progress value={(product.stock / 100) * 100} className="h-2" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Activity */}
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Latest updates</CardDescription>
                </div>
                <Activity className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <motion.div
                    key={index}
                    className="flex items-start space-x-3 pb-4 border-b border-gray-100 last:border-0 last:pb-0"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      activity.type === 'order' ? 'bg-blue-100' :
                      activity.type === 'alert' ? 'bg-red-100' :
                      activity.type === 'customer' ? 'bg-green-100' :
                      'bg-purple-100'
                    }`}>
                      {activity.type === 'order' && <ShoppingCart className="w-4 h-4 text-blue-600" />}
                      {activity.type === 'alert' && <Zap className="w-4 h-4 text-red-600" />}
                      {activity.type === 'customer' && <Users className="w-4 h-4 text-green-600" />}
                      {activity.type === 'payment' && <DollarSign className="w-4 h-4 text-purple-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{activity.action}</p>
                      <p className="text-sm text-muted-foreground truncate">{activity.detail}</p>
                      <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* AI Recommendations Summary */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50] p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                  <Lightbulb className="w-6 h-6 text-white" />
                </div>
                <div className="text-white">
                  <CardTitle className="text-white">AI-Powered Recommendations</CardTitle>
                  <CardDescription className="text-white/90">
                    Decision support insights from your data
                  </CardDescription>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="bg-white text-[#FF6B00] hover:bg-white/90 border-0"
                onClick={() => window.dispatchEvent(new CustomEvent('changeView', { detail: 'recommendations' }))}
              >
                View All
                <ArrowUpRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
          
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Critical Actions */}
              <motion.div 
                className="p-4 rounded-lg bg-red-50 border border-red-100"
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-red-900 mb-1">Critical Stock Alert</h4>
                    <p className="text-sm text-red-700 mb-2">
                      {inventory.filter(item => item.status === "Critical").length} items need immediate reordering
                    </p>
                    <Badge variant="destructive" className="text-xs">High Priority</Badge>
                  </div>
                </div>
              </motion.div>

              {/* Growth Opportunities */}
              <motion.div 
                className="p-4 rounded-lg bg-green-50 border border-green-100"
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-green-900 mb-1">Growth Opportunity</h4>
                    <p className="text-sm text-green-700 mb-2">
                      Engine Parts category showing +22% growth - expand inventory
                    </p>
                    <Badge className="text-xs bg-green-600">Recommended</Badge>
                  </div>
                </div>
              </motion.div>

              {/* Optimization Insights */}
              <motion.div 
                className="p-4 rounded-lg bg-blue-50 border border-blue-100"
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-blue-900 mb-1">Quick Win</h4>
                    <p className="text-sm text-blue-700 mb-2">
                      Bundle brake pads with brake fluid for 73% conversion rate
                    </p>
                    <Badge className="text-xs bg-blue-600">Easy Impact</Badge>
                  </div>
                </div>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Revenue Modal */}
      <Dialog open={modalOpen === "revenue"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <DollarSign className="w-5 h-5 mr-2" />
              Total Revenue Details
            </DialogTitle>
            <DialogDescription>
              Detailed breakdown of revenue over the past 10 months
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Transactions</TableHead>
                  <TableHead>Avg Order Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allRevenueData.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell>{formatCurrency(row.amount, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</TableCell>
                    <TableCell>{row.transactions}</TableCell>
                    <TableCell>{formatCurrency(row.avgOrder, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Orders Modal */}
      <Dialog open={modalOpen === "orders"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <ShoppingCart className="w-5 h-5 mr-2" />
              Recent Orders
            </DialogTitle>
            <DialogDescription>
              Latest orders from your customers
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allOrdersData.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{row.orderId}</TableCell>
                    <TableCell>{row.customer}</TableCell>
                    <TableCell>{formatCurrency(row.amount, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</TableCell>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "Completed" ? "secondary" : "default"}>
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customers Modal */}
      <Dialog open={modalOpen === "customers"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Users className="w-5 h-5 mr-2" />
              Active Customers
            </DialogTitle>
            <DialogDescription>
              Your top customers and their activity
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Total Orders</TableHead>
                  <TableHead>Total Revenue</TableHead>
                  <TableHead>Last Order</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allCustomersData.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.orders}</TableCell>
                    <TableCell>{formatCurrency(row.revenue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</TableCell>
                    <TableCell>{row.lastOrder}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Units Sold Modal */}
      <Dialog open={modalOpen === "units"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Package className="w-5 h-5 mr-2" />
              Units Sold by Product
            </DialogTitle>
            <DialogDescription>
              Top products ranked by units sold
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Units Sold</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Growth</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allUnitsData.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{row.product}</TableCell>
                    <TableCell>{row.units}</TableCell>
                    <TableCell>{formatCurrency(row.revenue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</TableCell>
                    <TableCell>
                      <Badge variant={row.growth.startsWith('+') ? "secondary" : "destructive"}>
                        {row.growth}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* All Products Modal */}
      <Dialog open={showAllProducts} onOpenChange={setShowAllProducts}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>All Products</DialogTitle>
            <DialogDescription>
              Complete list of all products sorted by sales performance
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Units Sold</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map((product, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF6B00] to-[#FF8A50] flex items-center justify-center text-white text-sm">
                        #{index + 1}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell>{product.sales} units</TableCell>
                    <TableCell>{formatCurrency(product.revenue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</TableCell>
                    <TableCell>
                      <Badge variant={product.trend.startsWith('+') ? "secondary" : "destructive"}>
                        {product.trend}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{product.stock}</span>
                        <Progress value={(product.stock / 120) * 100} className="h-2 w-16" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
