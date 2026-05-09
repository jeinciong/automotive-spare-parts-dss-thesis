import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Package, DollarSign, Activity, Calendar, ChevronDown, PhilippinePeso } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { motion } from "framer-motion";
import { useSalesReports } from "../contexts/SalesReportsContext";
import { useInventory } from "../contexts/InventoryContext";
import { GlobalFilters } from "../App";
import { formatCurrency } from "../lib/currency";

interface KPICardsProps {
  globalFilters?: GlobalFilters;
}

// Date Filter Types 
type FilterType = "all" | "today" | "weekly" | "monthly" | "yearly" | "quarterly" | "custom";

interface DateFilter {
  type: FilterType;
  quarter?: 1 | 2 | 3 | 4;
  quarterYear?: number;
  customStart?: string;
  customEnd?: string;
}

// Date Filter Component
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
      <div className="flex flex-wrap gap-2">
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

// Filter Helper 
function filterByDate<T extends { reportDate: string }>(
  rows: T[],
  filter: DateFilter
): T[] {
  if (filter.type === "all") return rows;

  const now = new Date();

  return rows.filter((r) => {
    const d = new Date(r.reportDate);

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

// Filter Label Helper 
function getFilterLabel(filter: DateFilter): string {
  if (filter.type === "all") return "All Time";
  if (filter.type === "today") return "Today";
  if (filter.type === "weekly") return "This Week";
  if (filter.type === "monthly") return "This Month";
  if (filter.type === "yearly") return "This Year";
  if (filter.type === "quarterly") {
    const q = filter.quarter ? `Q${filter.quarter}` : "Q?";
    const y = filter.quarterYear ?? new Date().getFullYear();
    return `${q} ${y}`;
  }
  if (filter.type === "custom") {
    if (filter.customStart && filter.customEnd)
      return `${filter.customStart} → ${filter.customEnd}`;
    if (filter.customStart) return `From ${filter.customStart}`;
    if (filter.customEnd) return `Until ${filter.customEnd}`;
  }
  return "";
}

// Main Component
export function KPICards({ globalFilters }: KPICardsProps) {
  const { salesReports } = useSalesReports();
  const { inventory } = useInventory();
  const [modalOpen, setModalOpen] = useState<string | null>(null);

  // Separate filters for each modal
  const [grossFilter, setGrossFilter] = useState<DateFilter>({ type: "all" });
  const [netFilter, setNetFilter] = useState<DateFilter>({ type: "all" });
  const [revenueFilter, setRevenueFilter] = useState<DateFilter>({ type: "all" });

  const filteredRevenueData = useMemo(() => {
    const months = ["January","February","March","April","May","June",
      "July","August","September","October","November","December"];
    const filtered = filterByDate(salesReports, revenueFilter);
    return months.map((month, index) => {
      const monthlySales = filtered.filter(r => new Date(r.reportDate).getMonth() === index);
      const totalMonthlyRevenue = monthlySales.reduce((sum, r) => sum + r.totalAmount, 0);
      const transactionCount = monthlySales.length;
      return {
        month, revenue: totalMonthlyRevenue, transactions: transactionCount,
        avgOrder: transactionCount > 0 ? Math.round(totalMonthlyRevenue / transactionCount) : 0
      };
    }).filter(m => m.transactions > 0);
  }, [salesReports, revenueFilter]);

  const filteredRevenueTotals = useMemo(() => {
    const filtered = filterByDate(salesReports, revenueFilter);
    return {
      totalRevenue: filtered.reduce((sum, r) => sum + r.totalAmount, 0),
      totalTransactions: filtered.length,
    };
  }, [salesReports, revenueFilter]);

  const formatPeso = (amount: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);

  const costMap = useMemo(() => {
    const map = new Map<string, number>();
    inventory.forEach((item) => {
      map.set(item.name.trim().toLowerCase(), Number(item.unitCost) || 0);
    });
    return map;
  }, [inventory]);

  const getCost = (productName: string) =>
    costMap.get(productName.trim().toLowerCase()) ?? 0;

  // Revenue Data 
  const revenueData = useMemo(() => {
    const months = ["January","February","March","April","May","June",
      "July","August","September","October","November","December"];
    return months.map((month, index) => {
      const monthlySales = salesReports.filter(r => new Date(r.reportDate).getMonth() === index);
      const totalMonthlyRevenue = monthlySales.reduce((sum, r) => sum + r.totalAmount, 0);
      const transactionCount = monthlySales.length;
      return {
        month, revenue: totalMonthlyRevenue, transactions: transactionCount,
        avgOrder: transactionCount > 0 ? Math.round(totalMonthlyRevenue / transactionCount) : 0
      };
    }).filter(m => m.transactions > 0);
  }, [salesReports]);

  // Units Data
  const unitsData = useMemo(() => {
    const productMap = new Map();
    salesReports.forEach(r => {
      const existing = productMap.get(r.productName) || { product: r.productName, units: 0, revenue: 0, category: r.category };
      productMap.set(r.productName, { ...existing, units: existing.units + r.quantity, revenue: existing.revenue + r.totalAmount });
    });
    return Array.from(productMap.values()).sort((a, b) => b.units - a.units).slice(0, 10);
  }, [salesReports]);

  const topProduct = useMemo(() => unitsData[0] || { product: "None", units: 0, revenue: 0 }, [unitsData]);

  const topProductData = useMemo(() => [
    { metric: "Total Units Sold", value: `${topProduct.units} units` },
    { metric: "Revenue Generated", value: formatPeso(topProduct.revenue) },
    { metric: "Average Price", value: topProduct.units > 0 ? formatPeso(topProduct.revenue / topProduct.units) : formatPeso(0) },
    { metric: "Status", value: "Best Seller" },
    { metric: "Category", value: topProduct.category || "N/A" },
  ], [topProduct]);

  // Profit Calculator (accepts filtered rows)
  const calcProfitData = (rows: typeof salesReports) => {
    const months = ["January","February","March","April","May","June",
      "July","August","September","October","November","December"];

    const totalRevenue       = rows.reduce((sum, r) => sum + r.totalAmount, 0);
    const totalOtherExpenses = rows.reduce((sum, r) => sum + (r.otherExpenses ?? 0), 0);
    const totalCOGS          = rows.reduce((sum, r) => sum + getCost(r.productName) * r.quantity, 0);
    const totalGrossProfit   = totalRevenue - totalCOGS;
    const totalNetIncome     = totalGrossProfit - totalOtherExpenses;
    const grossMargin  = totalRevenue > 0 ? ((totalGrossProfit / totalRevenue) * 100).toFixed(1) : "0";
    const netMargin    = totalRevenue > 0 ? ((totalNetIncome  / totalRevenue) * 100).toFixed(1) : "0";

    const monthly = months.map((month, index) => {
      const mRows       = rows.filter(r => new Date(r.reportDate).getMonth() === index);
      const revenue     = mRows.reduce((sum, r) => sum + r.totalAmount, 0);
      const otherExp    = mRows.reduce((sum, r) => sum + (r.otherExpenses ?? 0), 0);
      const cogs        = mRows.reduce((sum, r) => sum + getCost(r.productName) * r.quantity, 0);
      const grossProfit = revenue - cogs;
      const netIncome   = grossProfit - otherExp;
      const gMargin     = revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(1) : "0";
      const nMargin     = revenue > 0 ? ((netIncome   / revenue) * 100).toFixed(1) : "0";
      return { month, revenue, cogs, otherExp, grossProfit, netIncome, gMargin, nMargin };
    }).filter(m => m.revenue > 0);

    return { totalRevenue, totalCOGS, totalOtherExpenses, totalGrossProfit, totalNetIncome,
             grossMargin, netMargin, isGrossLoss: totalGrossProfit < 0, isNetLoss: totalNetIncome < 0, monthly };
  };

  // All-time profit (for KPI cards)
  const profitData = useMemo(() => calcProfitData(salesReports), [salesReports, costMap]);

  // Filtered profit for modals
  const grossProfitData = useMemo(
    () => calcProfitData(filterByDate(salesReports, grossFilter)),
    [salesReports, costMap, grossFilter]
  );
  const netProfitData = useMemo(
    () => calcProfitData(filterByDate(salesReports, netFilter)),
    [salesReports, costMap, netFilter]
  );

  // KPI Values
  const totalRev   = salesReports.reduce((sum, r) => sum + r.totalAmount, 0);
  const totalUnits = salesReports.reduce((sum, r) => sum + r.quantity, 0);
  const completionRate = salesReports.length > 0
    ? ((salesReports.filter(r => r.status === "Completed").length / salesReports.length) * 100).toFixed(1)
    : "0";

  const mainKpis = useMemo(() => [
    { title: "Total Revenue",   value: formatPeso(totalRev),       change: "+Real-time",                          isPositive: true, icon: () => <span className="font-bold text-white">₱</span>, id: "revenue" },
    { title: "Units Sold",      value: totalUnits.toLocaleString(),change: `Across ${salesReports.length} orders`,isPositive: true, icon: Package,    id: "units" },
    { title: "Top Product",     value: topProduct.product,         change: `${topProduct.units} units sold`,      isPositive: true, icon: TrendingUp,  id: "topproduct" },
    { title: "Completion Rate", value: `${completionRate}%`,       change: "Successful Sales",                    isPositive: true, icon: TrendingDown,id: "returns" },
  ], [salesReports, topProduct, totalRev, totalUnits, completionRate]);

  const bottomKpis = useMemo(() => [
    {
      title: "Gross Profit",
      value: formatPeso(profitData.totalGrossProfit),
      change: profitData.isGrossLoss ? `⚠ LOSS — ${profitData.grossMargin}% margin` : `${profitData.grossMargin}% gross margin`,
      isPositive: !profitData.isGrossLoss,
      icon: Activity,
      id: "grossprofit"
    },
    {
      title: "Net Income",
      value: formatPeso(profitData.totalNetIncome),
      change: profitData.isNetLoss ? `⚠ LOSS — ${profitData.netMargin}% margin` : `${profitData.netMargin}% net margin`,
      isPositive: !profitData.isNetLoss,
      icon: DollarSign,
      id: "netincome"
    },
  ], [profitData]);

  const renderCard = (kpi: typeof mainKpis[0]) => (
    <motion.div key={kpi.title} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
      <Card
        className="hover:shadow-xl transition-all cursor-pointer border-0 shadow-lg"
        onClick={() => setModalOpen(kpi.id)}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm">{kpi.title}</CardTitle>
          <div className={`p-2 rounded-lg ${
            (kpi.id === "netincome" || kpi.id === "grossprofit") && profitData.isNetLoss
              ? "bg-gradient-to-br from-red-500 to-red-700"
              : "bg-gradient-to-br from-[#FF6B00] to-[#FF8A50]"
          }`}>
            <kpi.icon className="h-4 w-4 text-white" />
          </div>
        </CardHeader>
        <CardContent>
          <div className={`text-3xl mb-1 ${
            (kpi.id === "netincome" || kpi.id === "grossprofit")
              ? profitData.isNetLoss ? "text-red-600" : "text-green-600"
              : ""
          }`}>
            {kpi.value}
          </div>
          <p className={`text-sm ${kpi.isPositive ? 'text-green-600' : 'text-red-600'} flex items-center mt-1`}>
            {kpi.isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
            {kpi.change}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {mainKpis.map(renderCard)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {bottomKpis.map(renderCard)}
      </div>

      {/* Revenue Modal */}
      <Dialog open={modalOpen === "revenue"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <PhilippinePeso className="h-5 w-5" />
              </div>
              Total Revenue Breakdown
              <Badge variant="outline" className="ml-auto text-xs font-normal text-gray-500">
                <Calendar className="w-3 h-3 mr-1" />
                {getFilterLabel(revenueFilter)}
              </Badge>
            </DialogTitle>
            <DialogDescription>Monthly revenue performance analysis</DialogDescription>
          </DialogHeader>

          {/* Date Filter */}
          <DateFilterBar filter={revenueFilter} onChange={setRevenueFilter} />

          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-2">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Revenue</p>
              <p className="text-lg font-bold">{formatPeso(filteredRevenueTotals.totalRevenue)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Transactions</p>
              <p className="text-lg font-bold">{filteredRevenueTotals.totalTransactions}</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Avg Order Value</p>
              <p className="text-lg font-bold text-orange-600">
                {formatPeso(
                  filteredRevenueTotals.totalTransactions > 0
                    ? Math.round(filteredRevenueTotals.totalRevenue / filteredRevenueTotals.totalTransactions)
                    : 0
                )}
              </p>
            </div>
          </div>

          {/* Monthly Table */}
          <div className="mt-4">
            {filteredRevenueData.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                No data found for the selected period.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Transactions</TableHead>
                    <TableHead>Avg Order Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRevenueData.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell>{formatPeso(row.revenue)}</TableCell>
                      <TableCell>{row.transactions}</TableCell>
                      <TableCell>{formatPeso(row.avgOrder)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Units Sold Modal */}
      <Dialog open={modalOpen === "units"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Package className="w-5 h-5 mr-2" />
              Units Sold Breakdown
            </DialogTitle>
            <DialogDescription>Top products by units sold</DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Units Sold</TableHead>
                  <TableHead>Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unitsData.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{row.product}</TableCell>
                    <TableCell>{row.category}</TableCell>
                    <TableCell>{row.units} units</TableCell>
                    <TableCell>{formatPeso(row.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Top Product Modal */}
      <Dialog open={modalOpen === "topproduct"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Top Product Performance
            </DialogTitle>
            <DialogDescription>Detailed performance metrics for {topProduct.product}</DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProductData.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{row.metric}</TableCell>
                    <TableCell><Badge variant="secondary">{row.value}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sales Status Analysis Modal */}
      <Dialog open={modalOpen === "returns"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <TrendingDown className="w-5 h-5 mr-2" />
              Sales Status Analysis
            </DialogTitle>
            <DialogDescription>Breakdown of product status across all reports</DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Percentage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {["Completed", "Pending", "Cancelled"].map((status, index) => {
                  const count = salesReports.filter(r => r.status === status).length;
                  const percentage = salesReports.length > 0
                    ? ((count / salesReports.length) * 100).toFixed(1) : "0";
                  return (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{status}</TableCell>
                      <TableCell>{count}</TableCell>
                      <TableCell>
                        <Badge variant={status === "Cancelled" ? "destructive" : "secondary"}>
                          {percentage}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Net Income Modal */}
      <Dialog open={modalOpen === "netincome"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <PhilippinePeso className="h-5 w-5" />
              </div>
              Net Income Breakdown
              {netProfitData.isNetLoss && (
                <Badge variant="destructive" className="ml-2">OVERALL LOSS</Badge>
              )}
              <Badge variant="outline" className="ml-auto text-xs font-normal text-gray-500">
                <Calendar className="w-3 h-3 mr-1" />
                {getFilterLabel(netFilter)}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Revenue − COGS (inventory unit costs) • Overall margin: {netProfitData.netMargin}%
            </DialogDescription>
          </DialogHeader>

          {/* Date Filter */}
          <DateFilterBar filter={netFilter} onChange={setNetFilter} />

          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4 mb-2">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Revenue</p>
              <p className="text-lg font-bold">{formatPeso(netProfitData.totalRevenue)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total COGS</p>
              <p className="text-lg font-bold text-red-600">{formatPeso(netProfitData.totalCOGS)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Other Expenses</p>
              <p className="text-lg font-bold text-orange-600">{formatPeso(netProfitData.totalOtherExpenses)}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Net Income</p>
              <p className={`text-lg font-bold ${netProfitData.isNetLoss ? "text-red-600" : "text-green-600"}`}>
                {formatPeso(netProfitData.totalNetIncome)}
              </p>
            </div>
          </div>

          {/* Monthly Table */}
          <div className="mt-4">
            {netProfitData.monthly.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                No data found for the selected period.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>COGS</TableHead>
                    <TableHead>Net Income</TableHead>
                    <TableHead>Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {netProfitData.monthly.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell>{formatPeso(row.revenue)}</TableCell>
                      <TableCell>{formatPeso(row.cogs)}</TableCell>
                      <TableCell className={row.netIncome >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                        {formatPeso(row.netIncome)}
                        {row.netIncome < 0 && <span className="ml-1 text-xs">LOSS</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={Number(row.nMargin) >= 0 ? "secondary" : "destructive"}>
                          {row.nMargin}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Gross Profit Modal */}
      <Dialog open={modalOpen === "grossprofit"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 mr-2" />
              Gross Profit Breakdown
              {grossProfitData.isGrossLoss && (
                <Badge variant="destructive" className="ml-2">⚠ OVERALL LOSS</Badge>
              )}
              <Badge variant="outline" className="ml-auto text-xs font-normal text-gray-500">
                <Calendar className="w-3 h-3 mr-1" />
                {getFilterLabel(grossFilter)}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Revenue − COGS per product • Overall margin: {grossProfitData.grossMargin}%
            </DialogDescription>
          </DialogHeader>

          {/* Date Filter */}
          <DateFilterBar filter={grossFilter} onChange={setGrossFilter} />

          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-2">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Revenue</p>
              <p className="text-lg font-bold">{formatPeso(grossProfitData.totalRevenue)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total COGS</p>
              <p className="text-lg font-bold text-red-600">{formatPeso(grossProfitData.totalCOGS)}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Gross Profit</p>
              <p className={`text-lg font-bold ${grossProfitData.isGrossLoss ? "text-red-600" : "text-green-600"}`}>
                {formatPeso(grossProfitData.totalGrossProfit)}
              </p>
            </div>
          </div>

          {/* Monthly Table */}
          <div className="mt-4">
            {grossProfitData.monthly.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                No data found for the selected period.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>COGS</TableHead>
                    <TableHead>Gross Profit</TableHead>
                    <TableHead>Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grossProfitData.monthly.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell>{formatPeso(row.revenue)}</TableCell>
                      <TableCell>{formatPeso(row.cogs)}</TableCell>
                      <TableCell className={row.grossProfit >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                        {formatPeso(row.grossProfit)}
                        {row.grossProfit < 0 && <span className="ml-1 text-xs">LOSS</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={Number(row.gMargin) >= 0 ? "secondary" : "destructive"}>
                          {row.gMargin}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}