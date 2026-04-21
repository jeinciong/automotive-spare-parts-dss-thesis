import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  TrendingUp, TrendingDown, Calendar, Target,
  LineChart, BarChart3, Activity, AlertTriangle, Brain, Info,
} from "lucide-react";
import {
  Line, AreaChart, Area,
  BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { motion } from "motion/react";
import { useForecast, MODEL_DESCRIPTIONS } from "../../contexts/ForecastContext";
import { useSalesReports } from "../../contexts/SalesReportsContext";
import { formatCurrency, formatCurrencyCompact, PESO_SYMBOL } from "../../lib/currency";

// ── Shared tooltip style ──────────────────────────────────────
const TT_STYLE = {
  contentStyle: {
    backgroundColor: "hsl(var(--background))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
  },
};

const currencyAxisFormatter = (value: number) => {
  return formatCurrencyCompact(value);
};

const currencyValueFormatter = (value: number) =>
  formatCurrency(value);

// ── Per-product forecast chart ────────────────────────────────
function ProductForecastChart({ productName }: { productName: string }) {
  const { productForecasts, runForecast } = useForecast();
  const fc = productForecasts[productName];

  useEffect(() => {
    if (!fc || (!fc.loading && !fc.forecasts.length && !fc.error)) {
      runForecast(productName, 6);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName]);

  const chartData = useMemo(() => {
    if (!fc) return [];
    const actMap: Record<string, number> = {};
    fc.history.forEach(h => { actMap[h.period] = h.actual; });
    const fcMap:  Record<string, typeof fc.forecasts[0]> = {};
    fc.forecasts.forEach(f => { fcMap[f.period] = f; });
    const all = Array.from(new Set([
      ...fc.history.map(h => h.period),
      ...fc.forecasts.map(f => f.period),
    ])).sort();
    return all.map(period => ({
      period,
      actual:    actMap[period]    ?? null,
      predicted: fcMap[period]?.predicted ?? null,
      ciLower:   fcMap[period]?.lower ?? null,
      ciUpper:   fcMap[period]?.upper ?? null,
      ciBand:    (fcMap[period]?.upper != null && fcMap[period]?.lower != null)
                  ? fcMap[period].upper! - fcMap[period].lower!
                  : null,
    }));
  }, [fc]);

  const lastActual = fc?.history.at(-1)?.period ?? "";
  const algorithm  = fc?.algorithm;

  if (fc?.loading) return (
    <div className="flex items-center justify-center h-48 gap-2 text-sm text-muted-foreground">
      <div className="w-4 h-4 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin"/>
      Running {algorithm ?? "forecast"} model…
    </div>
  );

  if (fc?.error) return (
    <div className="flex items-center justify-center h-48 gap-2 text-sm text-red-500">
      <AlertTriangle className="w-4 h-4"/>
      {fc.error.includes("Need") ? "Not enough sales history to forecast this product (need 12+ months)." : fc.error}
    </div>
  );

  if (!fc || chartData.length === 0) return (
    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
      No data yet. Click Run to generate.
    </div>
  );

  return (
    <>
      {/* Model badge + accuracy strip */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {algorithm && (
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 cursor-help">
                  <Badge variant="outline" className={`text-xs px-2 py-0.5 ${
                    algorithm === "ARIMA_XGB"
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}>
                    {algorithm === "ARIMA_XGB" ? "ARIMA + XGBoost" : "TSB + XGBoost"}
                  </Badge>
                  <Info className="w-3 h-3 text-muted-foreground"/>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                <p className="font-semibold mb-1">
                  {algorithm === "ARIMA_XGB" ? "ARIMA + XGBoost" : "TSB + XGBoost"}
                </p>
                <p>{MODEL_DESCRIPTIONS[algorithm]}</p>
                {fc.demand_type && (
                  <p className="mt-1.5 text-muted-foreground">
                    Demand: <strong>{fc.demand_type}</strong>
                    {" · "}ADI {fc.adi?.toFixed(2)}, CV² {fc.cv2?.toFixed(2)}
                  </p>
                )}
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        )}
        {fc.model_info?.accuracy != null && (
          <span className={`text-xs font-semibold ${
            fc.model_info.accuracy >= 90 ? "text-green-600"
            : fc.model_info.accuracy >= 75 ? "text-orange-500"
            : "text-red-600"
          }`}>
            {fc.model_info.accuracy.toFixed(1)}% accuracy
          </span>
        )}
        {fc.model_info?.mape != null && (
          <span className="text-xs text-muted-foreground">
            MAPE {fc.model_info.mape.toFixed(1)}%
          </span>
        )}
        {fc.model_info?.retrained && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${
            fc.model_info.retrain_improved
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-yellow-50 text-yellow-700 border-yellow-200"
          }`}>
            ↺ {fc.model_info.retrain_improved ? "Auto-retrained ✓" : "Auto-retrained"}
          </span>
        )}
        {fc.model_info?.low_accuracy && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
            <AlertTriangle className="w-3 h-3" />
            Low accuracy — re-run
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top:6, right:16, bottom:0, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false}
            style={{ stroke: "hsl(var(--border))" }}/>
          <XAxis dataKey="period" tick={{ fontSize:10, fill:"hsl(var(--muted-foreground))" }}
            interval="preserveStartEnd"/>
          <YAxis tick={{ fontSize:10, fill:"hsl(var(--muted-foreground))" }} width={42}/>
          <Tooltip
            {...TT_STYLE}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;

              const point = payload[0]?.payload as {
                actual?: number | null;
                predicted?: number | null;
                ciLower?: number | null;
                ciUpper?: number | null;
              };

              const rows = [
                point?.actual != null ? { label: "Historical sales", value: point.actual, color: "#FF6B00" } : null,
                point?.predicted != null ? { label: "Predicted sales", value: point.predicted, color: "#8b5cf6" } : null,
                point?.ciLower != null ? { label: "Lower prediction limit", value: point.ciLower, color: "#7c3aed" } : null,
                point?.ciUpper != null ? { label: "Upper prediction limit", value: point.ciUpper, color: "#a78bfa" } : null,
              ].filter(Boolean) as Array<{ label: string; value: number; color: string }>;

              if (rows.length === 0) return null;

              return (
                <div style={TT_STYLE.contentStyle}>
                  <div className="px-3 py-2">
                    <p className="mb-2 text-xs font-semibold">{label}</p>
                    <div className="space-y-1.5">
                      {rows.map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-4 text-xs">
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: row.color }}
                            />
                            {row.label}
                          </span>
                          <span className="font-medium text-foreground">{row.value.toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }}
          />
          {/* CI band */}
          <Area type="linear" dataKey="ciLower" stroke="none" fill="none"
            legendType="none" name="_ciFloor" stackId="ci" connectNulls/>
          <Area type="linear" dataKey="ciBand" stroke="none"
            fill="#8b5cf6" fillOpacity={0.12} legendType="none"
            name="_ciBand" stackId="ci" connectNulls/>
          {lastActual && (
            <ReferenceLine x={lastActual} stroke="hsl(var(--border))"
              strokeDasharray="4 3"
              label={{ value:"→ Forecast", fill:"hsl(var(--muted-foreground))", fontSize:9, position:"insideTopRight" }}/>
          )}
          <Line type="monotone" dataKey="actual" name="Actual"
            stroke="#FF6B00" strokeWidth={2.5} connectNulls={false}
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              return <circle key={`a${props.index}`} cx={cx} cy={cy}
                r={payload.predicted ? 4 : 2.5} fill="#FF6B00"
                stroke="white" strokeWidth={payload.predicted ? 1.5 : 0}/>;
            }}/>
          <Line type="monotone" dataKey="predicted" name="Forecast"
            stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 3"
            dot={{ r:3, fill:"#8b5cf6", strokeWidth:0 }} connectNulls={false}/>
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

function BusinessRevenueForecastChart() {
  const { businessRevenueForecast, runBusinessRevenueForecast } = useForecast();
  const fc = businessRevenueForecast;

  useEffect(() => {
    if (!fc || (!fc.loading && !fc.forecasts.length && !fc.error)) {
      runBusinessRevenueForecast(6);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartData = useMemo(() => {
    if (!fc) return [];
    const actMap: Record<string, number> = {};
    fc.history.forEach(h => { actMap[h.period] = h.actual; });
    const fcMap: Record<string, typeof fc.forecasts[0]> = {};
    fc.forecasts.forEach(f => { fcMap[f.period] = f; });
    const all = Array.from(new Set([
      ...fc.history.map(h => h.period),
      ...fc.forecasts.map(f => f.period),
    ])).sort();
    return all.map(period => ({
      period,
      actual: actMap[period] ?? null,
      predicted: fcMap[period]?.predicted ?? null,
      ciLower: fcMap[period]?.lower ?? null,
      ciUpper: fcMap[period]?.upper ?? null,
      ciBand: (fcMap[period]?.upper != null && fcMap[period]?.lower != null)
        ? fcMap[period].upper! - fcMap[period].lower!
        : null,
    }));
  }, [fc]);

  const lastActual = fc?.history.at(-1)?.period ?? "";

  if (fc?.loading) return (
    <div className="flex items-center justify-center h-48 gap-2 text-sm text-muted-foreground">
      <div className="w-4 h-4 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin"/>
      Running business revenue model...
    </div>
  );

  if (fc?.error) return (
    <div className="flex items-center justify-center h-48 gap-2 text-sm text-red-500">
      <AlertTriangle className="w-4 h-4"/>
      {fc.error.includes("Need") ? "Not enough monthly revenue history to forecast total revenue (need 12+ months)." : fc.error}
    </div>
  );

  if (!fc || chartData.length === 0) return (
    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
      No revenue forecast data yet.
    </div>
  );

  return (
    <>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <TooltipProvider>
          <UITooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 cursor-help">
                <Badge variant="outline" className={`text-xs px-2 py-0.5 ${
                  fc.algorithm === "ARIMA_XGB"
                    ? "bg-purple-50 text-purple-700 border-purple-200"
                    : "bg-blue-50 text-blue-700 border-blue-200"
                }`}>
                  {fc.algorithm === "ARIMA_XGB" ? "ARIMA + XGBoost" : "TSB + XGBoost"}
                </Badge>
                <Info className="w-3 h-3 text-muted-foreground"/>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
              <p className="font-semibold mb-1">
                {fc.algorithm === "ARIMA_XGB" ? "ARIMA + XGBoost" : "TSB + XGBoost"}
              </p>
              <p>{MODEL_DESCRIPTIONS[fc.algorithm]}</p>
              <p className="mt-1.5 text-muted-foreground">
                Demand: <strong>{fc.demand_type}</strong>
                {" · "}ADI {fc.adi?.toFixed(2)}, CV² {fc.cv2?.toFixed(2)}
              </p>
            </TooltipContent>
          </UITooltip>
        </TooltipProvider>
        {fc.model_info?.accuracy != null && (
          <span className={`text-xs font-semibold ${
            fc.model_info.accuracy >= 90 ? "text-green-600"
            : fc.model_info.accuracy >= 75 ? "text-orange-500"
            : "text-red-600"
          }`}>
            {fc.model_info.accuracy.toFixed(1)}% accuracy
          </span>
        )}
        {fc.model_info?.mape != null && (
          <span className="text-xs text-muted-foreground">
            MAPE {fc.model_info.mape.toFixed(1)}%
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={fc.loading}
          onClick={() => runBusinessRevenueForecast(6, true)}
        >
          Re-run
        </Button>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top:6, right:16, bottom:0, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false}
            style={{ stroke: "hsl(var(--border))" }}/>
          <XAxis dataKey="period" tick={{ fontSize:10, fill:"hsl(var(--muted-foreground))" }}
            interval="preserveStartEnd"/>
          <YAxis
            tick={{ fontSize:10, fill:"hsl(var(--muted-foreground))" }}
            width={64}
            tickFormatter={currencyAxisFormatter}
          />
          <Tooltip
            {...TT_STYLE}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;

              const point = payload[0]?.payload as {
                actual?: number | null;
                predicted?: number | null;
                ciLower?: number | null;
                ciUpper?: number | null;
              };

              const rows = [
                point?.actual != null ? { label: "Historical revenue", value: point.actual, color: "#FF6B00" } : null,
                point?.predicted != null ? { label: "Predicted revenue", value: point.predicted, color: "#10b981" } : null,
                point?.ciLower != null ? { label: "Lower prediction limit", value: point.ciLower, color: "#059669" } : null,
                point?.ciUpper != null ? { label: "Upper prediction limit", value: point.ciUpper, color: "#6ee7b7" } : null,
              ].filter(Boolean) as Array<{ label: string; value: number; color: string }>;

              if (rows.length === 0) return null;

              return (
                <div style={TT_STYLE.contentStyle}>
                  <div className="px-3 py-2">
                    <p className="mb-2 text-xs font-semibold">{label}</p>
                    <div className="space-y-1.5">
                      {rows.map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-4 text-xs">
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                            {row.label}
                          </span>
                          <span className="font-medium text-foreground">{currencyValueFormatter(row.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }}
          />
          <Area type="linear" dataKey="ciLower" stroke="none" fill="none"
            legendType="none" name="_ciFloor" stackId="ci" connectNulls/>
          <Area type="linear" dataKey="ciBand" stroke="none"
            fill="#10b981" fillOpacity={0.12} legendType="none"
            name="_ciBand" stackId="ci" connectNulls/>
          {lastActual && (
            <ReferenceLine x={lastActual} stroke="hsl(var(--border))"
              strokeDasharray="4 3"
              label={{ value:"→ Forecast", fill:"hsl(var(--muted-foreground))", fontSize:9, position:"insideTopRight" }}/>
          )}
          <Line type="monotone" dataKey="actual" name="Actual"
            stroke="#FF6B00" strokeWidth={2.5} connectNulls={false}
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              return <circle key={`r${props.index}`} cx={cx} cy={cy}
                r={payload.predicted ? 4 : 2.5} fill="#FF6B00"
                stroke="white" strokeWidth={payload.predicted ? 1.5 : 0}/>;
            }}/>
          <Line type="monotone" dataKey="predicted" name="Forecast"
            stroke="#10b981" strokeWidth={2} strokeDasharray="5 3"
            dot={{ r:3, fill:"#10b981", strokeWidth:0 }} connectNulls={false}/>
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

// ── Main view ─────────────────────────────────────────────────
export function PredictionsTrendsView() {
  const { salesReports }                        = useSalesReports();
  const { productForecasts, runForecast, overallAccuracy } = useForecast();
  const [selectedProduct, setSelectedProduct]   = useState<string>("");

  // Derive unique product list from sales reports
  const productList = useMemo(() =>
    Array.from(new Set(salesReports.map(r => r.productName))).sort(),
  [salesReports]);

  // Auto-select first product
  useEffect(() => {
    if (!selectedProduct && productList.length) {
      setSelectedProduct(productList[0]);
    }
  }, [productList, selectedProduct]);

  // Category quarterly breakdown
  const categoryTrends = useMemo(() => {
    const map: Record<string, {q1:number;q2:number;q3:number;q4:number}> = {};
    salesReports.forEach(r => {
      const m   = new Date(r.reportDate).getMonth();
      const cat = r.category || "Other";
      if (!map[cat]) map[cat] = {q1:0,q2:0,q3:0,q4:0};
      if      (m < 3) map[cat].q1 += r.totalAmount;
      else if (m < 6) map[cat].q2 += r.totalAmount;
      else if (m < 9) map[cat].q3 += r.totalAmount;
      else            map[cat].q4 += r.totalAmount;
    });
    return Object.entries(map)
      .map(([category, q]) => {
        const base   = q.q1 || 1;
        const growth = Math.round(((q.q4 - base) / base) * 100);
        return { category, ...q, growth };
      })
      .sort((a, b) => b.q4 - a.q4).slice(0, 6);
  }, [salesReports]);

  // Weekly trend
  const weeklyTrends = useMemo(() => {
    const wm: Record<string, {sales:number;orders:number}> = {};
    salesReports.forEach(r => {
      const d      = new Date(r.reportDate);
      const start  = new Date(d.getFullYear(), 0, 1);
      const wn     = Math.ceil(((d.getTime()-start.getTime())/86400000 + start.getDay()+1)/7);
      const key    = `W${wn} '${String(d.getFullYear()).slice(2)}`;
      if (!wm[key]) wm[key] = {sales:0,orders:0};
      wm[key].sales  += r.totalAmount;
      wm[key].orders += 1;
    });
    return Object.entries(wm).sort(([a],[b])=>a.localeCompare(b)).slice(-6)
      .map(([week, v]) => ({ week, sales:v.sales, orders:v.orders,
        avgOrder: v.orders > 0 ? Math.round(v.sales/v.orders) : 0 }));
  }, [salesReports]);

  const revenueMonthCount = useMemo(() => {
    if (salesReports.length === 0) return 0;

    const monthMap: Record<string, number> = {};
    salesReports.forEach((report) => {
      const saleDate = new Date(report.reportDate);
      const key = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = (monthMap[key] ?? 0) + report.totalAmount;
    });

    const sortedMonths = Object.keys(monthMap).sort();
    if (sortedMonths.length === 0) return 0;

    const [startYear, startMonth] = sortedMonths[0].split("-").map(Number);
    const [endYear, endMonth] = sortedMonths[sortedMonths.length - 1].split("-").map(Number);
    const start = new Date(startYear, startMonth - 1, 1);
    const end = new Date(endYear, endMonth - 1, 1);

    let count = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      count += 1;
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return count;
  }, [salesReports]);

  const showRevenueForecast = revenueMonthCount >= 12;

  const fastestGrowing   = [...categoryTrends].sort((a,b)=>b.growth-a.growth)[0];
  const fastestDeclining = [...categoryTrends].sort((a,b)=>a.growth-b.growth)[0];

  const containerVariants = {
    hidden:  { opacity:0 },
    visible: { opacity:1, transition:{ staggerChildren:0.1 } },
  };
  const itemVariants = {
    hidden:  { opacity:0, y:20 },
    visible: { opacity:1, y:0, transition:{ stiffness:100, damping:10 } },
  };

  return (
    <motion.div className="space-y-6" variants={containerVariants} initial="hidden" animate="visible">

      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1>Predictions &amp; Trends Analysis</h1>
        <p className="text-muted-foreground">
          AI-powered sales forecasting, demand predictions, and comprehensive trend analysis
        </p>
      </motion.div>

      {/* KPI cards */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" variants={containerVariants}>
        <motion.div variants={itemVariants} whileHover={{ scale:1.05 }}>
          <Card className="border-l-4 border-l-green-500 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Forecast Accuracy</CardTitle>
              <TrendingUp className="h-5 w-5 text-green-600"/>
            </CardHeader>
            <CardContent>
              <div className="text-2xl">
                {overallAccuracy?.accuracy != null ? `${overallAccuracy.accuracy}%` : "—"}
              </div>
              <p className="text-xs text-green-600 mt-1">
                {overallAccuracy?.pairs ? `${overallAccuracy.pairs} verified periods` : "Run a forecast to compute"}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} whileHover={{ scale:1.05 }}>
          <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Products Tracked</CardTitle>
              <Calendar className="h-5 w-5 text-blue-600"/>
            </CardHeader>
            <CardContent>
              <div className="text-2xl">{productList.length}</div>
              <p className="text-xs text-blue-600 mt-1">
                {Object.keys(productForecasts).length} forecasted
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} whileHover={{ scale:1.05 }}>
          <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Fastest Growing</CardTitle>
              <Target className="h-5 w-5 text-purple-600"/>
            </CardHeader>
            <CardContent>
              <div className="text-2xl truncate">{fastestGrowing?.category ?? "—"}</div>
              {fastestGrowing && (
                <p className="text-xs text-purple-600 mt-1">
                  {fastestGrowing.growth >= 0 ? "+" : ""}{fastestGrowing.growth}% Q1→Q4
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} whileHover={{ scale:1.05 }}>
          <Card className="border-l-4 border-l-red-500 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Risk Alert</CardTitle>
              <TrendingDown className="h-5 w-5 text-red-600"/>
            </CardHeader>
            <CardContent>
              <div className="text-2xl truncate">{fastestDeclining?.category ?? "—"}</div>
              {fastestDeclining && fastestDeclining.growth < 0 && (
                <p className="text-xs text-red-600 mt-1">{fastestDeclining.growth}% declining</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Tabs */}
      <Tabs defaultValue="forecast" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="forecast"  className="flex items-center gap-2">
            <Activity  className="h-4 w-4"/> Sales Forecast
          </TabsTrigger>
          <TabsTrigger value="category" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4"/> Category Trends
          </TabsTrigger>
          <TabsTrigger value="weekly"   className="flex items-center gap-2">
            <LineChart className="h-4 w-4"/> Weekly Analysis
          </TabsTrigger>
        </TabsList>

        {/* ── Sales Forecast Tab ── */}
        <TabsContent value="forecast" className="space-y-4">

          {showRevenueForecast && (
            <Card>
              <CardHeader>
                <CardTitle>Business Sales Revenue Forecast</CardTitle>
                <CardDescription>
                  Monthly business sales revenue stored as its own trained artifact while still auto-selecting the ARIMA+XGB or TSB+XGB pipeline
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BusinessRevenueForecastChart />
              </CardContent>
            </Card>
          )}

          {/* Product selector */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle>Product Sales Forecast</CardTitle>
                  <CardDescription>
                    Select a product to view its ARIMA+XGB or TSB+XGB forecast with 95% confidence intervals
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger className="w-56 h-8 text-sm">
                      <SelectValue placeholder="Select a product"/>
                    </SelectTrigger>
                    <SelectContent>
                      {productList.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="h-8 text-xs"
                    disabled={!selectedProduct || productForecasts[selectedProduct]?.loading}
                    onClick={() => selectedProduct && runForecast(selectedProduct, 6, true)}>
                    Re-run
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedProduct ? (
                <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                  Select a product above to view its forecast
                </div>
              ) : (
                <ProductForecastChart key={selectedProduct} productName={selectedProduct}/>
              )}
            </CardContent>
          </Card>

          {/* All products overview */}
          {productList.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">All Products — Forecast Overview</CardTitle>
                <CardDescription>
                  Click a product to run its forecast. Model type is auto-selected based on demand pattern.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {productList.map(name => {
                    const fc  = productForecasts[name];
                    const done = fc && !fc.loading && !fc.error && fc.forecasts.length > 0;
                    const err  = fc?.error;
                    return (
                      <button key={name}
                        className={`text-left p-3 rounded-lg border transition-all hover:shadow-md ${
                          selectedProduct === name
                            ? "border-[#FF6B00] bg-orange-50 dark:bg-orange-950/20"
                            : "border-border bg-muted/30 hover:border-[#FF6B00]/50"
                        }`}
                        onClick={() => {
                          setSelectedProduct(name);
                          if (!fc || (!fc.loading && !fc.forecasts.length && !fc.error)) {
                            runForecast(name, 6);
                          }
                        }}
                      >
                        <p className="text-xs font-medium truncate">{name}</p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          {fc?.loading && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <div className="w-2.5 h-2.5 border border-purple-500 border-t-transparent rounded-full animate-spin"/>
                              Running…
                            </span>
                          )}
                          {done && (
                            <>
                              <Badge variant="outline" className={`text-xs py-0 px-1.5 ${
                                fc.algorithm === "ARIMA_XGB"
                                  ? "text-purple-700 border-purple-200 bg-purple-50"
                                  : "text-blue-700 border-blue-200 bg-blue-50"
                              }`}>
                                {fc.algorithm === "ARIMA_XGB" ? "ARIMA" : "TSB"}
                              </Badge>
                              {fc.model_info?.accuracy != null && (
                                <span className={`text-xs font-semibold ${
                                  fc.model_info.accuracy >= 90 ? "text-green-600"
                                  : fc.model_info.accuracy >= 75 ? "text-orange-500"
                                  : "text-red-500"
                                }`}>
                                  {fc.model_info.accuracy.toFixed(1)}%
                                </span>
                              )}
                              {fc.model_info?.retrained && (
                                <span className={`text-xs ${
                                  fc.model_info.retrain_improved ? "text-green-600" : "text-yellow-600"
                                }`} title={fc.model_info.retrain_improved ? "Auto-retrained and improved" : "Auto-retrained (no improvement)"}>
                                  ↺
                                </span>
                              )}
                              {fc.model_info?.low_accuracy && (
                                <AlertTriangle className="w-3 h-3 text-red-500" title="Low accuracy — re-run forecast"/>
                              )}
                            </>
                          )}
                          {err && (
                            <span className="text-xs text-red-500 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3"/> Error
                            </span>
                          )}
                          {!fc && (
                            <span className="text-xs text-muted-foreground">Not run yet</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Accuracy summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Forecast Accuracy</CardTitle></CardHeader>
              <CardContent>
                {overallAccuracy?.accuracy != null ? (
                  <div className="space-y-3">
                    {[
                      { label:"Overall Accuracy", value:overallAccuracy.accuracy, color:"from-green-500 to-emerald-500", text:"text-green-600" },
                      { label:"MAPE",             value:overallAccuracy.mape ? 100-overallAccuracy.mape : null, color:"from-blue-500 to-indigo-500", text:"text-blue-600" },
                    ].map(({ label, value, color, text }) => (
                      <div key={label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{label}</span>
                          <span className={text}>{value != null ? `${value.toFixed(1)}%` : "—"}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full bg-gradient-to-r ${color}`}
                            style={{ width:`${Math.min(100,Math.max(0,value??0))}%` }}/>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground pt-1">
                      Based on {overallAccuracy.pairs} verified forecast period{overallAccuracy.pairs !== 1 ? "s" : ""}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Run a forecast on any product to see accuracy metrics here.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Key Insights</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {fastestGrowing && fastestGrowing.growth > 0 && (
                    <div className="flex items-start gap-2">
                      <TrendingUp className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0"/>
                      <p><strong>{fastestGrowing.category}</strong> is growing at +{fastestGrowing.growth}% Q1→Q4.</p>
                    </div>
                  )}
                  {fastestDeclining && fastestDeclining.growth < 0 && (
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0"/>
                      <p><strong>{fastestDeclining.category}</strong> shows a declining trend — consider action.</p>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <Brain className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0"/>
                    <p>ARIMA+XGB for regular demand · TSB+XGB for intermittent/lumpy demand. Model is auto-selected.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Category Trends Tab ── */}
        <TabsContent value="category" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quarterly Category Performance</CardTitle>
              <CardDescription>Revenue by category across quarters (from actual sales)</CardDescription>
            </CardHeader>
            <CardContent>
              {categoryTrends.length === 0 ? (
                <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
                  No sales data available.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart data={categoryTrends}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted"/>
                    <XAxis dataKey="category" className="text-xs"/>
                    <YAxis className="text-xs"/>
                    <Tooltip {...TT_STYLE} formatter={(v: number) => formatCurrencyCompact(v)}/>
                    <Legend/>
                    <Bar dataKey="q1" fill="#3b82f6" name="Q1"/>
                    <Bar dataKey="q2" fill="#8b5cf6" name="Q2"/>
                    <Bar dataKey="q3" fill="#ec4899" name="Q3"/>
                    <Bar dataKey="q4" fill="#10b981" name="Q4"/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Category Growth Analysis</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {categoryTrends.map(cat => (
                  <div key={cat.category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{cat.category}</span>
                      <span className={cat.growth >= 0 ? "text-green-600" : "text-red-600"}>
                        {cat.growth >= 0 ? "+" : ""}{cat.growth}% YoY
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${cat.growth >= 0
                        ? "bg-gradient-to-r from-green-500 to-emerald-500"
                        : "bg-gradient-to-r from-red-500 to-orange-500"}`}
                        style={{ width:`${Math.min(100,Math.abs(cat.growth)*4)}%` }}/>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Weekly Analysis Tab ── */}
        <TabsContent value="weekly" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Performance Trends</CardTitle>
              <CardDescription>Recent weekly sales patterns and order metrics</CardDescription>
            </CardHeader>
            <CardContent>
              {weeklyTrends.length === 0 ? (
                <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
                  No weekly data available.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={380}>
                  <AreaChart data={weeklyTrends}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted"/>
                    <XAxis dataKey="week" className="text-xs"/>
                    <YAxis className="text-xs"/>
                    <Tooltip {...TT_STYLE}
                      formatter={(v: number, name: string) =>
                        name === `Sales (${PESO_SYMBOL})` ? [formatCurrencyCompact(v), name] : [v, name]}/>
                    <Legend/>
                    <Area type="monotone" dataKey="sales"  stroke="#8b5cf6"
                      fill="#8b5cf6" fillOpacity={0.3} name={`Sales (${PESO_SYMBOL})`}/>
                    <Area type="monotone" dataKey="orders" stroke="#3b82f6"
                      fill="#3b82f6" fillOpacity={0.3} name="Orders"/>
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title:"Week-over-Week Growth",
                value: weeklyTrends.length >= 2
                  ? `${(((weeklyTrends.at(-1)!.sales - weeklyTrends[0].sales) / weeklyTrends[0].sales)*100).toFixed(1)}%`
                  : "—",
                sub:"Based on actual sales data", color:"text-green-600" },
              { title:"Avg Order Value",
                value: weeklyTrends.length
                  ? formatCurrency(Math.round(weeklyTrends.reduce((s,w)=>s+w.avgOrder,0)/weeklyTrends.length), { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                  : "—",
                sub:"Across last 6 weeks", color:"text-muted-foreground" },
              { title:"Total Orders (6w)",
                value: weeklyTrends.reduce((s,w)=>s+w.orders,0).toLocaleString(),
                sub:"Cumulative recent orders", color:"text-green-600" },
            ].map(({ title, value, sub, color }) => (
              <Card key={title}>
                <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-3xl mb-2">{value}</div>
                  <p className={`text-sm ${color}`}>{sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

      </Tabs>
    </motion.div>
  );
}
