import { useMemo, useState, useRef, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useSalesReports } from "../contexts/SalesReportsContext";
import { formatCurrency, formatCurrencyCompact } from "../lib/currency";

// Types 
type FilterMode = "all" | "today" | "week" | "month" | "year" | "quarter" | "custom";

interface QuarterFilter {
  quarter: 1 | 2 | 3 | 4;
  year: number;
}

interface CustomFilter {
  from: string; // "YYYY-MM-DD"
  to: string;
}

// Helpers 
function getDateRange(
  mode: FilterMode,
  quarterFilter: QuarterFilter,
  customFilter: CustomFilter,
  reports: { reportDate: string }[]
): { from: Date; to: Date } {
  const now = new Date();

  if (mode === "all") {
    if (reports.length === 0) {
      return { from: new Date(2000, 0, 1), to: new Date() };
    }
    const dates = reports.map(r => new Date(r.reportDate).getTime());
    return {
      from: new Date(Math.min(...dates)),
      to: new Date(),
    };
  }
  if (mode === "today") {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end   = new Date(now); end.setHours(23, 59, 59, 999);
    return { from: start, to: end };
  }
  if (mode === "week") {
    const day = now.getDay();
    const start = new Date(now); start.setDate(now.getDate() - day); start.setHours(0, 0, 0, 0);
    const end   = new Date(now); end.setDate(now.getDate() + (6 - day)); end.setHours(23, 59, 59, 999);
    return { from: start, to: end };
  }
  if (mode === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from: start, to: end };
  }
  if (mode === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    const end   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { from: start, to: end };
  }
  if (mode === "quarter") {
    const qStartMonth = (quarterFilter.quarter - 1) * 3;
    const start = new Date(quarterFilter.year, qStartMonth, 1);
    const end   = new Date(quarterFilter.year, qStartMonth + 3, 0, 23, 59, 59, 999);
    return { from: start, to: end };
  }
  // custom
  const from = customFilter.from ? new Date(customFilter.from) : new Date(2000, 0, 1);
  const to   = customFilter.to   ? new Date(customFilter.to)   : new Date(2099, 11, 31);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

/** Pill button matching the sales-report filter bar */
function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-xs transition-all cursor-pointer whitespace-nowrap text-center w-full sm:w-auto border ${
        active 
          ? "bg-[#FF6B00] text-white font-medium border-[#FF6B00] shadow-sm" 
          : "bg-white text-gray-700 font-normal border-gray-200 hover:border-gray-300"
      }`}
    >
      {label}
    </button>
  );
}

/** Quarter dropdown (Q1-Q4 + year) */
function QuarterPicker({
  value,
  onChange,
}: {
  value: QuarterFilter;
  onChange: (v: QuarterFilter) => void;
}) {
  const [qOpen, setQOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);
  const quarters: { label: string; q: 1 | 2 | 3 | 4 }[] = [
    { label: "Q1 (Jan – Mar)", q: 1 },
    { label: "Q2 (Apr – Jun)", q: 2 },
    { label: "Q3 (Jul – Sep)", q: 3 },
    { label: "Q4 (Oct – Dec)", q: 4 },
  ];

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setQOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedLabel = quarters.find(q => q.q === value.quarter)?.label ?? "Q1 (Jan – Mar)";

  return (
    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto relative" ref={ref}>
      {/* Quarter selector */}
      <div className="relative w-full sm:w-auto">
        <button
          onClick={() => setQOpen(o => !o)}
          className="flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs cursor-pointer text-gray-700 w-full sm:w-auto"
        >
          {selectedLabel}
          <span className="text-[10px]">▼</span>
        </button>
        {qOpen && (
          <div className="absolute top-calc(100% + 4px) left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[170px] overflow-hidden">
            {quarters.map(q => (
              <button
                key={q.q}
                onClick={() => { onChange({ ...value, quarter: q.q }); setQOpen(false); }}
                className={`flex items-center justify-between w-full px-4 py-2.5 bg-none border-none text-xs cursor-pointer text-left ${
                  value.quarter === q.q ? "text-[#FF6B00] font-semibold" : "text-gray-700 font-normal"
                }`}
              >
                {q.label}
                {value.quarter === q.q && <span className="text-[#FF6B00]">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Year selector */}
      <select
        aria-label="Select year"
        value={value.year}
        onChange={e => onChange({ ...value, year: Number(e.target.value) })}
        className="px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-xs cursor-pointer text-gray-700 w-full sm:w-auto"
      >
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

/** Custom date range picker */
function CustomRangePicker({
  value,
  onChange,
}: {
  value: CustomFilter;
  onChange: (v: CustomFilter) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
      <input
        type="date"
        value={value.from}
        onChange={e => onChange({ ...value, from: e.target.value })}
        placeholder="mm/dd/yyyy"
        className="px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-xs text-gray-700 cursor-pointer w-full sm:w-auto"
      />
      <span className="text-xs text-gray-400 text-center">to</span>
      <input
        type="date"
        value={value.to}
        onChange={e => onChange({ ...value, to: e.target.value })}
        placeholder="mm/dd/yyyy"
        className="px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-xs text-gray-700 cursor-pointer w-full sm:w-auto"
      />
    </div>
  );
}

// Main Component 
export function SalesCharts({ globalFilters }: { globalFilters?: any }) {
  const { salesReports } = useSalesReports();

  // Filter state
  const [mode, setMode] = useState<FilterMode>("all");
  const [quarterFilter, setQuarterFilter] = useState<QuarterFilter>({
    quarter: 1,
    year: new Date().getFullYear(),
  });
  const [customFilter, setCustomFilter] = useState<CustomFilter>({ from: "", to: "" });

  // Filtered reports
  const filteredReports = useMemo(() => {
    const { from, to } = getDateRange(mode, quarterFilter, customFilter, salesReports);
    return salesReports.filter(r => {
      const d = new Date(r.reportDate);
      return d >= from && d <= to;
    });
  }, [salesReports, mode, quarterFilter, customFilter]);

  // Chart data
  const salesTrendData = useMemo(() => {
    const dataMap: Record<string, number> = {};
    const sorted = [...filteredReports].sort(
      (a, b) => new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime()
    );
    sorted.forEach(r => {
      const d = new Date(r.reportDate);
      const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
      dataMap[key] = (dataMap[key] || 0) + r.totalAmount;
    });
    return Object.entries(dataMap).map(([name, sales]) => ({ name, sales }));
  }, [filteredReports]);

  const topProductsData = useMemo(() => {
    const productMap: Record<string, { name: string; sales: number; revenue: number }> = {};
    filteredReports.forEach(r => {
      if (!productMap[r.productName])
        productMap[r.productName] = { name: r.productName, sales: 0, revenue: 0 };
      productMap[r.productName].sales += r.quantity;
      productMap[r.productName].revenue += r.totalAmount;
    });
    return Object.values(productMap).sort((a, b) => b.sales - a.sales).slice(0, 5);
  }, [filteredReports]);

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredReports.forEach(r => {
      const amount = Number(r.totalAmount) || 0;
      map[r.category] = (map[r.category] || 0) + amount;
    });
    const colors = ["#FF6B00", "#607D8B", "#212121", "#0088FE", "#00C49F", "#FFBB28", "#FF8042"];
    return Object.entries(map)
      .map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }))
      .filter(item => item.value > 1)
      .sort((a, b) => b.value - a.value);
  }, [filteredReports]);

  const recordCount = filteredReports.length;

  const pills: { label: string; value: FilterMode }[] = [
    { label: "All",        value: "all"     },
    { label: "Today",      value: "today"   },
    { label: "This Week",  value: "week"    },
    { label: "This Month", value: "month"   },
    { label: "This Year",  value: "year"    },
    { label: "Quarter",    value: "quarter" },
    { label: "Custom Range", value: "custom" },
  ];

  return (
    <div>
      {/* ── Filter Bar ── */}
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2 p-3 sm:px-6 sm:py-3 bg-white border-b border-gray-100">
        <span className="text-xs text-muted-foreground mr-1 font-medium">
          Filter by:
        </span>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
          {pills.map(p => (
            <FilterPill
              key={p.value}
              label={p.label}
              active={mode === p.value}
              onClick={() => setMode(p.value)}
            />
          ))}
        </div>

        {/* Conditional extras */}
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          {mode === "quarter" && (
            <QuarterPicker value={quarterFilter} onChange={setQuarterFilter} />
          )}
          {mode === "custom" && (
            <CustomRangePicker value={customFilter} onChange={setCustomFilter} />
          )}
        </div>

        {/* Record count */}
        <div className="flex-1 w-full sm:w-auto flex justify-end items-center mt-2 sm:mt-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap text-right">
            {recordCount.toLocaleString()} records shown
          </span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
        {/* Sales Trend */}
        <Card>
          <CardHeader><CardTitle>Sales Trend (Historical)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesTrendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(val: number) => [formatCurrency(val, { minimumFractionDigits: 0, maximumFractionDigits: 0 }), "Sales"]} />
                <Line type="monotone" dataKey="sales" stroke="#00C49F" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Selling Products */}
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

        {/* Sales by Category */}
        <Card className="flex flex-col h-full">
          <CardHeader><CardTitle>Sales by Category</CardTitle></CardHeader>
          <CardContent className="flex-1 pb-2">
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%" cy="45%"
                  innerRadius={70} outerRadius={110}
                  paddingAngle={0}
                  dataKey="value"
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: number) => formatCurrency(val, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} />
                <Legend verticalAlign="bottom" align="center" iconType="circle" layout="horizontal" wrapperStyle={{ paddingTop: "20px" }} />
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
                <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={30} tick={{ fontSize: 11, fill: "#666" }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => formatCurrencyCompact(value)} />
                <Tooltip formatter={(val: number) => [formatCurrency(val, { minimumFractionDigits: 0, maximumFractionDigits: 0 }), "Revenue"]} />
                <Bar dataKey="revenue" fill="#FF8A50" radius={[4, 4, 0, 0]} barSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}