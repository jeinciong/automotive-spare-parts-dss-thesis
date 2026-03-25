import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Package, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { motion } from "framer-motion";
import { useSalesReports } from "../contexts/SalesReportsContext";
import { GlobalFilters } from "../App";

interface KPICardsProps {
  globalFilters?: GlobalFilters;
}

export function KPICards({ globalFilters }: KPICardsProps) {
  const { salesReports } = useSalesReports();
  const [modalOpen, setModalOpen] = useState<string | null>(null);

  // Calculate Revenue Data by Month for the Revenue Modal
  const revenueData = useMemo(() => {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentYear = new Date().getFullYear();

    return months.map((month, index) => {
      const monthlySales = salesReports.filter(r => {
        const d = new Date(r.reportDate);
        return d.getMonth() === index && d.getFullYear() === currentYear;
      });

      const totalMonthlyRevenue = monthlySales.reduce((sum, r) => sum + r.totalAmount, 0);
      const transactionCount = monthlySales.length;

      return {
        month,
        revenue: totalMonthlyRevenue,
        transactions: transactionCount,
        avgOrder: transactionCount > 0 ? Math.round(totalMonthlyRevenue / transactionCount) : 0
      };
    }).filter(m => m.transactions > 0); // Only show months with data
  }, [salesReports]);

  // Calculate Units Sold by Product for the Units Modal
  const unitsData = useMemo(() => {
    const productMap = new Map();
    salesReports.forEach(r => {
      const existing = productMap.get(r.productName) || { product: r.productName, units: 0, revenue: 0, category: r.category };
      productMap.set(r.productName, {
        ...existing,
        units: existing.units + r.quantity,
        revenue: existing.revenue + r.totalAmount
      });
    });
    return Array.from(productMap.values()).sort((a, b) => b.units - a.units).slice(0, 10);
  }, [salesReports]);

  // Find the Top Product for the Top Product Modal
  const topProduct = useMemo(() => {
    return unitsData[0] || { product: "None", units: 0, revenue: 0 };
  }, [unitsData]);

  const topProductData = useMemo(() => [
    { metric: "Total Units Sold", value: `${topProduct.units} units` },
    { metric: "Revenue Generated", value: `$${topProduct.revenue.toLocaleString()}` },
    { metric: "Average Price", value: topProduct.units > 0 ? `$${Math.round(topProduct.revenue / topProduct.units)}` : "$0" },
    { metric: "Status", value: "Best Seller" },
    { metric: "Category", value: topProduct.category || "N/A" },
  ], [topProduct]);

  // Calculate KPI Card summaries
  const kpiData = useMemo(() => {
    const totalRev = salesReports.reduce((sum, r) => sum + r.totalAmount, 0);
    const totalUnits = salesReports.reduce((sum, r) => sum + r.quantity, 0);
    const completionRate = salesReports.length > 0 
      ? ((salesReports.filter(r => r.status === "Completed").length / salesReports.length) * 100).toFixed(1)
      : "0";

    return [
      {
        title: "Total Revenue",
        value: `$${totalRev.toLocaleString()}`,
        change: "+Real-time",
        isPositive: true,
        icon: DollarSign,
        id: "revenue"
      },
      {
        title: "Units Sold",
        value: totalUnits.toLocaleString(),
        change: `Across ${salesReports.length} orders`,
        isPositive: true,
        icon: Package,
        id: "units"
      },
      {
        title: "Top Product",
        value: topProduct.product,
        change: `${topProduct.units} units sold`,
        isPositive: true,
        icon: TrendingUp,
        id: "topproduct"
      },
      {
        title: "Completion Rate",
        value: `${completionRate}%`,
        change: "Successful Sales",
        isPositive: true,
        icon: TrendingDown,
        id: "returns"
      },
    ];
  }, [salesReports, topProduct]);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiData.map((kpi) => (
          <motion.div
            key={kpi.title}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Card 
              className="hover:shadow-xl transition-all cursor-pointer border-0 shadow-lg"
              onClick={() => setModalOpen(kpi.id)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">
                  {kpi.title}
                </CardTitle>
                <div className="p-2 bg-gradient-to-br from-[#FF6B00] to-[#FF8A50] rounded-lg">
                  <kpi.icon className="h-4 w-4 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl mb-1">{kpi.value}</div>
                <p className={`text-sm ${kpi.isPositive ? 'text-green-600' : 'text-red-600'} flex items-center mt-1`}>
                  {kpi.isPositive ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {kpi.change}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Revenue Modal */}
      <Dialog open={modalOpen === "revenue"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <DollarSign className="w-5 h-5 mr-2" />
              Total Revenue Breakdown
            </DialogTitle>
            <DialogDescription>
              Monthly revenue performance analysis
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
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
                {revenueData.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell>${row.revenue.toLocaleString()}</TableCell>
                    <TableCell>{row.transactions}</TableCell>
                    <TableCell>${row.avgOrder}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
            <DialogDescription>
              Top products by units sold
            </DialogDescription>
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
                    <TableCell>${row.revenue.toLocaleString()}</TableCell>
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
            <DialogDescription>
              Detailed performance metrics for {topProduct.product}
            </DialogDescription>
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
                    <TableCell>
                      <Badge variant="secondary">{row.value}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Completion Rate (Return Rate) Modal */}
      <Dialog open={modalOpen === "returns"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <TrendingDown className="w-5 h-5 mr-2" />
              Sales Status Analysis
            </DialogTitle>
            <DialogDescription>
              Breakdown of product status across all reports
            </DialogDescription>
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
                  const percentage = salesReports.length > 0 ? ((count / salesReports.length) * 100).toFixed(1) : "0";
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
    </>
  );
}