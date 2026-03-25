import {
  createContext, useContext, useState,
  useCallback, ReactNode,
} from "react";
import { toast } from "sonner";

export interface ForecastPoint {
  period:    string;
  predicted: number;
  lower:     number | null;
  upper:     number | null;
}
export interface HistoryPoint { period: string; actual: number; }
export interface ForecastModelInfo {
  algorithm:        "ARIMA_XGB" | "TSB_XGB";
  arima_order?:     number[];
  tsb_alpha?:       number;
  tsb_beta?:        number;
  n_train:          number;
  horizon:          number;
  mape:             number | null;
  accuracy:         number | null;
  // Auto-retrain fields (set by Python model)
  retrained:        boolean;
  retrain_improved: boolean;
  initial_mape:     number | null;
  low_accuracy:     boolean;
}
export interface ProductForecast {
  product_name: string;
  algorithm:    "ARIMA_XGB" | "TSB_XGB";
  demand_type:  string;
  adi:          number;
  cv2:          number;
  forecasts:    ForecastPoint[];
  history:      HistoryPoint[];
  model_info:   ForecastModelInfo;
  loading:      boolean;
  error:        string | null;
}
export interface ForecastAccuracy { accuracy: number|null; mape: number|null; pairs: number; }

export interface SeasonalDecompPoint { period:string; actual:number; trend:number; seasonal:number; residual:number; }
export interface SeasonalIndexPoint  { month:string; index:number; avg_qty:number; }
export interface YearComparison      { year:number; total:number; }
export interface SeasonalResult {
  product_name:     string | null;
  decomposition:    SeasonalDecompPoint[];
  seasonal_index:   SeasonalIndexPoint[];
  forecast:         ForecastPoint[];
  peak_month:       string;
  trough_month:     string;
  yoy_growth:       number;
  years_comparison: YearComparison[];
  n_train:          number;
  loading:          boolean;
  error:            string | null;
}

interface ForecastContextType {
  productForecasts:   Record<string, ProductForecast>;
  overallAccuracy:    ForecastAccuracy | null;
  accuracyLoading:    boolean;
  seasonalResults:    Record<string, SeasonalResult>;
  runForecast:         (productName: string, horizon?: number) => Promise<void>;
  fetchAccuracy:       () => Promise<void>;
  runSeasonalAnalysis: (productName?: string) => Promise<void>;
}

const ForecastContext = createContext<ForecastContextType | undefined>(undefined);
const API = "http://localhost:5000";

export function ForecastProvider({ children }: { children: ReactNode }) {
  const [productForecasts, setProductForecasts] = useState<Record<string, ProductForecast>>({});
  const [overallAccuracy,  setOverallAccuracy]  = useState<ForecastAccuracy | null>(null);
  const [accuracyLoading,  setAccuracyLoading]  = useState(false);
  const [seasonalResults,  setSeasonalResults]  = useState<Record<string, SeasonalResult>>({});

  const runForecast = useCallback(async (productName: string, horizon = 6) => {
    const companyId = JSON.parse(localStorage.getItem("user")||"{}").company_id;
    if (!companyId) return;
    setProductForecasts(prev => ({
      ...prev,
      [productName]: {
        ...prev[productName], product_name: productName,
        loading:true, error:null,
        algorithm:   prev[productName]?.algorithm   ?? "ARIMA_XGB",
        demand_type: prev[productName]?.demand_type ?? "",
        adi: prev[productName]?.adi ?? 0, cv2: prev[productName]?.cv2 ?? 0,
        forecasts: prev[productName]?.forecasts ?? [],
        history:   prev[productName]?.history   ?? [],
        model_info:prev[productName]?.model_info ?? {} as ForecastModelInfo,
      }
    }));
    try {
      const res  = await fetch(`${API}/api/forecast`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ company_id:companyId, product_name:productName, horizon }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Forecast failed");

      const info: ForecastModelInfo = data.model_info;

      // ── Retrain notifications ────────────────────────────────
      if (info.retrained) {
        if (info.retrain_improved) {
          toast.success(
            `Auto-retrain improved ${productName}`,
            {
              description:
                `MAPE improved from ${info.initial_mape?.toFixed(1)}% → ${info.mape?.toFixed(1)}%. ` +
                `Accuracy: ${info.accuracy?.toFixed(1)}%`,
              duration: 6000,
            }
          );
        } else {
          toast.warning(
            `Auto-retrain ran for ${productName}`,
            {
              description:
                `Model retrained (MAPE was ${info.initial_mape?.toFixed(1)}%) but ` +
                `could not improve beyond ${info.mape?.toFixed(1)}% MAPE. ` +
                `Consider collecting more sales data.`,
              duration: 8000,
            }
          );
        }
      }

      // ── Low-accuracy warning (after retrain, still poor) ─────
      if (info.low_accuracy) {
        toast.warning(
          `Low forecast accuracy for ${productName}`,
          {
            description:
              `MAPE is ${info.mape?.toFixed(1)}% (accuracy ${info.accuracy?.toFixed(1)}%). ` +
              `Consider re-running once more sales data is available, ` +
              `or verify the sales history is complete.`,
            duration: 10000,
            action: {
              label: "Re-run",
              onClick: () => runForecast(productName, horizon),
            },
          }
        );
      }

      setProductForecasts(prev => ({
        ...prev,
        [productName]: {
          product_name:productName, algorithm:data.algorithm,
          demand_type:data.demand_type, adi:data.adi, cv2:data.cv2,
          forecasts:data.forecasts, history:data.history,
          model_info:info, loading:false, error:null,
        }
      }));

      // ── Refresh dashboard accuracy after every forecast ──────
      // Small delay so the DB write in the backend finishes first
      setTimeout(() => {
        const compId = JSON.parse(localStorage.getItem("user")||"{}").company_id;
        if (!compId) return;
        fetch(`${API}/api/forecast/accuracy?company_id=${compId}`)
          .then(r => r.json())
          .then(acc => {
            // Dispatch custom event so DashboardView can pick it up
            window.dispatchEvent(new CustomEvent("forecastAccuracyUpdated", { detail: acc }));
          })
          .catch(() => {});
      }, 500);

    } catch(err) {
      setProductForecasts(prev => ({
        ...prev, [productName]: { ...prev[productName], loading:false, error:String(err) }
      }));
    }
  }, []);

  const fetchAccuracy = useCallback(async () => {
    const companyId = JSON.parse(localStorage.getItem("user")||"{}").company_id;
    if (!companyId) return;
    setAccuracyLoading(true);
    try {
      const res = await fetch(`${API}/api/forecast/accuracy?company_id=${companyId}`);
      setOverallAccuracy(await res.json());
    } catch { /* silent */ } finally { setAccuracyLoading(false); }
  }, []);

  const runSeasonalAnalysis = useCallback(async (productName?: string) => {
    const companyId = JSON.parse(localStorage.getItem("user")||"{}").company_id;
    if (!companyId) return;
    const key = productName ?? "__all__";
    const blank: SeasonalResult = {
      product_name:productName??null, decomposition:[], seasonal_index:[],
      forecast:[], peak_month:"", trough_month:"", yoy_growth:0,
      years_comparison:[], n_train:0, loading:true, error:null,
    };
    setSeasonalResults(prev => ({ ...prev, [key]: { ...(prev[key]??blank), loading:true, error:null } }));
    try {
      const body: any = { company_id: companyId };
      if (productName) body.product_name = productName;
      const res  = await fetch(`${API}/api/seasonal`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Seasonal analysis failed");
      setSeasonalResults(prev => ({
        ...prev,
        [key]: {
          product_name:data.product_name, decomposition:data.decomposition,
          seasonal_index:data.seasonal_index, forecast:data.forecast,
          peak_month:data.peak_month, trough_month:data.trough_month,
          yoy_growth:data.yoy_growth, years_comparison:data.years_comparison,
          n_train:data.n_train, loading:false, error:null,
        }
      }));
    } catch(err) {
      setSeasonalResults(prev => ({ ...prev, [key]: { ...(prev[key]??blank), loading:false, error:String(err) } }));
    }
  }, []);

  return (
    <ForecastContext.Provider value={{
      productForecasts, overallAccuracy, accuracyLoading,
      seasonalResults, runForecast, fetchAccuracy, runSeasonalAnalysis,
    }}>
      {children}
    </ForecastContext.Provider>
  );
}

export function useForecast() {
  const ctx = useContext(ForecastContext);
  if (!ctx) throw new Error("useForecast must be used within ForecastProvider");
  return ctx;
}

export const MODEL_DESCRIPTIONS: Record<string, string> = {
  ARIMA_XGB:
    "ARIMA+XGB is used for products with regular, predictable demand. " +
    "ARIMA captures trend and seasonality; XGBoost corrects non-linear residuals. " +
    "Best for smooth or erratic demand where sales occur every or most months.",
  TSB_XGB:
    "TSB+XGB is used for intermittent or lumpy demand — products that sell " +
    "infrequently or in unpredictable bursts. TSB tracks demand probability and " +
    "size separately; XGBoost refines the residuals. Best for spare parts with " +
    "long gaps between sales.",
  SEASONAL:
    "STL (Seasonal-Trend decomposition using LOESS) separates sales into trend, " +
    "seasonal, and residual components. The seasonal index shows which months " +
    "historically over- or under-perform, and the forecast projects the next 12 " +
    "months by combining the trend slope with the extracted seasonal pattern.",
};
