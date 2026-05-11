import {
  createContext, useContext, useState,
  useCallback, ReactNode, useEffect, useRef,
} from "react";
import { toast } from "sonner";
import { useSalesReports } from "./SalesReportsContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { apiUrl } from "../lib/api";

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
  arima_aic?:       number;
  tsb_alpha?:       number;
  tsb_beta?:        number;
  tsb_mse?:         number;
  n_train:          number;
  horizon:          number;
  mape:             number | null;
  accuracy:         number | null;
  xgb_enabled?:     boolean;
  // Auto-retrain fields (set by Python model)
  retrained:        boolean;
  retrain_improved: boolean;
  initial_mape:     number | null;
  low_accuracy:     boolean;
  saved_model_path?: string;
  from_cache?:      boolean;
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
export interface BusinessRevenueForecast {
  series_name: string;
  algorithm: "ARIMA_XGB" | "TSB_XGB";
  demand_type: string;
  adi: number;
  cv2: number;
  forecasts: ForecastPoint[];
  history: HistoryPoint[];
  model_info: ForecastModelInfo;
  loading: boolean;
  error: string | null;
}

interface ForecastContextType {
  productForecasts:   Record<string, ProductForecast>;
  businessRevenueForecast: BusinessRevenueForecast | null;
  overallAccuracy:    ForecastAccuracy | null;
  accuracyLoading:    boolean;
  runForecast:         (
    productName: string,
    horizon?: number,
    forceRetrain?: boolean,
    options?: { notify?: boolean }
  ) => Promise<void>;
  runBusinessRevenueForecast: (
    horizon?: number,
    forceRetrain?: boolean
  ) => Promise<void>;
  fetchAccuracy:       () => Promise<void>;
}

const ForecastContext = createContext<ForecastContextType | undefined>(undefined);

export function ForecastProvider({ children }: { children: ReactNode }) {
  const [productForecasts, setProductForecasts] = useState<Record<string, ProductForecast>>({});
  const [businessRevenueForecast, setBusinessRevenueForecast] = useState<BusinessRevenueForecast | null>(null);
  const [overallAccuracy,  setOverallAccuracy]  = useState<ForecastAccuracy | null>(null);
  const [accuracyLoading,  setAccuracyLoading]  = useState(false);
  // const [rerunConfirmOpen, setRerunConfirmOpen] = useState(false);
  // const [rerunProductName, setRerunProductName] = useState("");
  const { salesReports } = useSalesReports();
  const preloadedProductsRef = useRef<Set<string>>(new Set());
  const preloadedRevenueBusinessRef = useRef<number | null>(null);
  const activeBusinessIdRef = useRef<number | null>(null);
  // const rerunConfirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  // const requestRerunConfirmation = useCallback((productName: string) => {
  //   setRerunProductName(productName);
  //   setRerunConfirmOpen(true);

  //   return new Promise<boolean>((resolve) => {
  //     rerunConfirmResolverRef.current = resolve;
  //   });
  // }, []);

  // const resolveRerunConfirmation = useCallback((confirmed: boolean) => {
  //   rerunConfirmResolverRef.current?.(confirmed);
  //   rerunConfirmResolverRef.current = null;
  //   setRerunConfirmOpen(false);
  //   setRerunProductName("");
  // }, []);

  const runForecast = useCallback(async (
    productName: string,
    horizon = 6,
    forceRetrain = false,
    options?: { notify?: boolean }
  ) => {
    const businessId = JSON.parse(localStorage.getItem("user")||"{}").business_id;
    if (!businessId) return;
    const notify = options?.notify ?? true;

    // if (forceRetrain) {
    //   const confirmed = await requestRerunConfirmation(productName);
    //   if (!confirmed) {
    //     return;
    //   }
    // }

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
      const res  = await fetch(apiUrl("/api/forecast"), {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          business_id:businessId,
          product_name:productName,
          horizon,
          force_retrain: forceRetrain,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Forecast failed");

      const info: ForecastModelInfo = data.model_info;

      // ── Retrain notifications ────────────────────────────────
      if (notify && info.retrained && !info.from_cache) {
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
      if (notify && info.low_accuracy && !info.from_cache) {
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
              onClick: () => runForecast(productName, horizon, true),
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
        const compId = JSON.parse(localStorage.getItem("user")||"{}").business_id;
        if (!compId) return;
        fetch(apiUrl(`/api/forecast/accuracy?business_id=${compId}`))
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
  }, []); //requestRerunConfirmation

  const runBusinessRevenueForecast = useCallback(async (
    horizon = 6,
    forceRetrain = false,
  ) => {
    const businessId = JSON.parse(localStorage.getItem("user") || "{}").business_id;
    if (!businessId) return;

    setBusinessRevenueForecast(prev => ({
      series_name: prev?.series_name ?? "Business Sales Revenue",
      algorithm: prev?.algorithm ?? "ARIMA_XGB",
      demand_type: prev?.demand_type ?? "",
      adi: prev?.adi ?? 0,
      cv2: prev?.cv2 ?? 0,
      forecasts: prev?.forecasts ?? [],
      history: prev?.history ?? [],
      model_info: prev?.model_info ?? {} as ForecastModelInfo,
      loading: true,
      error: null,
    }));

    try {
      const res = await fetch(apiUrl("/api/forecast/revenue"), {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          business_id: businessId,
          horizon,
          force_retrain: forceRetrain,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Revenue forecast failed");

      setBusinessRevenueForecast({
        series_name: data.series_name ?? "Business Sales Revenue",
        algorithm: data.algorithm,
        demand_type: data.demand_type,
        adi: data.adi,
        cv2: data.cv2,
        forecasts: data.forecasts ?? [],
        history: data.history ?? [],
        model_info: data.model_info,
        loading: false,
        error: null,
      });
    } catch (err) {
      setBusinessRevenueForecast(prev => ({
        series_name: prev?.series_name ?? "Business Sales Revenue",
        algorithm: prev?.algorithm ?? "ARIMA_XGB",
        demand_type: prev?.demand_type ?? "",
        adi: prev?.adi ?? 0,
        cv2: prev?.cv2 ?? 0,
        forecasts: prev?.forecasts ?? [],
        history: prev?.history ?? [],
        model_info: prev?.model_info ?? {} as ForecastModelInfo,
        loading: false,
        error: String(err),
      }));
    }
  }, []);

  useEffect(() => {
    const businessId = JSON.parse(localStorage.getItem("user") || "{}").business_id ?? null;

    if (activeBusinessIdRef.current !== businessId) {
      activeBusinessIdRef.current = businessId;
      preloadedProductsRef.current = new Set();
      preloadedRevenueBusinessRef.current = null;
      setProductForecasts({});
      setBusinessRevenueForecast(null);
      setOverallAccuracy(null);
    }

    if (!businessId || salesReports.length === 0) {
      return;
    }

    const uniqueProducts = Array.from(new Set(
      salesReports
        .map(report => report.productName)
        .filter(Boolean)
    ));

    const productsToLoad = uniqueProducts.filter(productName => {
      if (preloadedProductsRef.current.has(productName)) {
        return false;
      }

      const existingForecast = productForecasts[productName];
      return !existingForecast?.loading && !existingForecast?.forecasts?.length;
    });

    if (productsToLoad.length === 0) {
      return;
    }

    productsToLoad.forEach(productName => preloadedProductsRef.current.add(productName));
    void Promise.all(
      productsToLoad.map(productName =>
        runForecast(productName, 6, false, { notify: false })
      )
    );
  }, [productForecasts, runForecast, salesReports]);

  useEffect(() => {
    const businessId = JSON.parse(localStorage.getItem("user") || "{}").business_id ?? null;
    if (!businessId) {
      return;
    }

    if (preloadedRevenueBusinessRef.current === businessId) {
      return;
    }

    preloadedRevenueBusinessRef.current = businessId;
    void runBusinessRevenueForecast(6, false);
  }, [runBusinessRevenueForecast, salesReports]);

  const fetchAccuracy = useCallback(async () => {
    const businessId = JSON.parse(localStorage.getItem("user")||"{}").business_id;
    if (!businessId) return;
    setAccuracyLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/forecast/accuracy?business_id=${businessId}`));
      setOverallAccuracy(await res.json());
    } catch { /* silent */ } finally { setAccuracyLoading(false); }
  }, []);

  return (
    <>
      <ForecastContext.Provider value={{
        productForecasts, businessRevenueForecast, overallAccuracy, accuracyLoading,
        runForecast, runBusinessRevenueForecast, fetchAccuracy,
      }}>
        {children}
      </ForecastContext.Provider>

      {/* <AlertDialog
        open={rerunConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            resolveRerunConfirmation(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm forecast re-run</AlertDialogTitle>
            <AlertDialogDescription>
              {`Do you want to re-run the sales forecast for ${rerunProductName}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolveRerunConfirmation(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => resolveRerunConfirmation(true)}>
              Re-run forecast
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog> */}
    </>
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
};
