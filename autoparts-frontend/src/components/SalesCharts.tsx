import { useMemo } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend 
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useSalesReports } from "../contexts/SalesReportsContext";

export function SalesCharts({ globalFilters }: { globalFilters?: any }) {
  const { salesReports } = useSalesReports();

  const salesTrendData = useMemo(() => {
    const dataMap: Record<string, number> = {};
    
    // Sort reports by date first to ensure chronological order
    const sortedReports = [...salesReports].sort((a, b) => 
      new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime()
    );

    sortedReports.forEach(r => {
      const d = new Date(r.reportDate);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      dataMap[key] = (dataMap[key] || 0) + r.totalAmount;
    });

    return Object.entries(dataMap).map(([name, sales]) => ({ name, sales }));
  }, [salesReports]);

  const topProductsData = useMemo(() => {
    const productMap: Record<string, { name: string; sales: number; revenue: number }> = {};
    salesReports.forEach(r => {
      if (!productMap[r.productName]) productMap[r.productName] = { name: r.productName, sales: 0, revenue: 0 };
      productMap[r.productName].sales += r.quantity;
      productMap[r.productName].revenue += r.totalAmount;
    });
    return Object.values(productMap).sort((a, b) => b.sales - a.sales).slice(0, 5);
  }, [salesReports]);

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    salesReports.forEach(r => { 
      const amount = Number(r.totalAmount) || 0;
      map[r.category] = (map[r.category] || 0) + amount; 
    });

    const colors = ["#FF6B00", "#607D8B", "#212121", "#0088FE", "#00C49F", "#FFBB28", "#FF8042"];
    
    return Object.entries(map)
      .map(([name, value], i) => ({
        name, 
        value, 
        color: colors[i % colors.length]
      }))
      .filter(item => item.value > 1) 
      .sort((a, b) => b.value - a.value);
  }, [salesReports]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
      {/* Historical Sales Trend */}
      <Card>
        <CardHeader><CardTitle>Sales Trend (Historical)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesTrendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(val: number) => [`$${val.toLocaleString()}`, 'Sales']} />
              <Line type="monotone" dataKey="sales" stroke="#00C49F" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Selling Products (Units) */}
      <Card>
        <CardHeader><CardTitle>Top Selling Products (Units)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topProductsData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="sales" fill="#00C49F" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Sales by Category (%) */}
      <Card className="flex flex-col h-full">
        <CardHeader><CardTitle>Sales by Category</CardTitle></CardHeader>
        <CardContent className="flex-1 pb-2">
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="45%"
                innerRadius={70} 
                outerRadius={110}
                paddingAngle={0}
                dataKey="value"
                label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                labelLine={true}
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(val: number) => `$${val.toLocaleString()}`} />
              <Legend 
                verticalAlign="bottom" 
                align="center" 
                iconType="circle"
                layout="horizontal"
                wrapperStyle={{ paddingTop: "20px" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Revenue by Top Products */}
      <Card className="flex flex-col h-full">
        <CardHeader><CardTitle>Revenue by Top Products</CardTitle></CardHeader>
        <CardContent className="flex-1 pb-2">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={topProductsData} margin={{ bottom: 60, top: 10, left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis 
                dataKey="name" 
                angle={-45} 
                textAnchor="end" 
                interval={0} 
                height={30} 
                tick={{ fontSize: 11, fill: '#666' }}
              />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `$${value / 1000}k`} />
              <Tooltip formatter={(val: number) => [`$${val.toLocaleString()}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="#FF8A50" radius={[4, 4, 0, 0]} barSize={60} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}