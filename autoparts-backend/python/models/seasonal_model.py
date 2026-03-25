"""
Seasonal Pattern Analysis Model — STL Decomposition
=====================================================
Uses STL (Seasonal-Trend decomposition using LOESS) to break
monthly sales into three components:

  trend     — the long-run direction (rising/falling)
  seasonal  — repeating calendar patterns (peaks/troughs per month)
  residual  — random noise after trend + seasonal are removed

Outputs per-month seasonal indices (index > 1 = above average,
< 1 = below average) and a 12-month seasonal forecast that rides
the extracted seasonal pattern on top of the latest trend.

Modify:
  PERIOD          — seasonality cycle length (12 for monthly)
  FORECAST_YEARS  — how many future years to project
  STL_ROBUST      — True makes fit resistant to outlier months
"""

import sys, json, warnings
import numpy as np
import pandas as pd
warnings.filterwarnings("ignore")

# ── Configuration ─────────────────────────────────────────────
PERIOD         = 12    # monthly seasonality
FORECAST_YEARS = 1     # periods = FORECAST_YEARS * PERIOD
STL_ROBUST     = True  # resist outlier distortion
MIN_OBS        = 24    # need at least 2 full cycles
# ─────────────────────────────────────────────────────────────

MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun",
               "Jul","Aug","Sep","Oct","Nov","Dec"]


def run_seasonal_analysis(dates: list, quantities: list):
    """
    Parameters
    ----------
    dates      : list of "YYYY-MM" strings (monthly)
    quantities : list of float quantities (same length)

    Returns
    -------
    dict with keys:
      decomposition   — list of { period, actual, trend, seasonal, residual }
      seasonal_index  — list of { month, index, avg_qty } for Jan–Dec
      forecast        — list of { period, predicted, lower, upper }
      peak_month      — name of historically strongest month
      trough_month    — name of historically weakest month
      yoy_growth      — estimated year-on-year growth rate (%)
    """
    try:
        from statsmodels.tsa.seasonal import STL
    except ImportError:
        return {"success": False, "error": "statsmodels not installed"}

    n = len(quantities)
    if n < MIN_OBS:
        return {"success": False,
                "error": f"Need >= {MIN_OBS} months; got {n}"}

    series = pd.Series(
        [float(q) for q in quantities],
        index=pd.PeriodIndex(dates, freq="M"),
        dtype=float
    )

    # ── STL decomposition ──────────────────────────────────────
    stl    = STL(series, period=PERIOD, robust=STL_ROBUST)
    result = stl.fit()

    trend    = result.trend
    seasonal = result.seasonal
    residual = result.resid

    decomp = [
        {
            "period":   str(series.index[i]),
            "actual":   round(float(series.iloc[i]), 2),
            "trend":    round(float(trend.iloc[i]), 2),
            "seasonal": round(float(seasonal.iloc[i]), 2),
            "residual": round(float(residual.iloc[i]), 2),
        }
        for i in range(n)
    ]

    # ── Seasonal indices (avg seasonal component per calendar month) ─
    # Index = (mean_seasonal_for_month / overall_mean_seasonal) + 1
    # Values > 1 → above-average demand that month
    monthly_seasonal: dict[int, list] = {m: [] for m in range(1, 13)}
    for i in range(n):
        month = series.index[i].month
        monthly_seasonal[month].append(float(seasonal.iloc[i]))

    overall_mean = float(series.mean())
    seasonal_index = []
    for m in range(1, 13):
        vals = monthly_seasonal[m]
        avg_seasonal = float(np.mean(vals)) if vals else 0.0
        # Express as multiplicative index relative to mean demand
        idx = 1.0 + avg_seasonal / overall_mean if overall_mean > 0 else 1.0
        avg_qty = overall_mean + avg_seasonal
        seasonal_index.append({
            "month":   MONTH_NAMES[m - 1],
            "index":   round(idx, 4),
            "avg_qty": round(max(0.0, avg_qty), 2),
        })

    # Peak / trough
    peak_m   = max(seasonal_index, key=lambda x: x["index"])["month"]
    trough_m = min(seasonal_index, key=lambda x: x["index"])["month"]

    # ── Year-on-year growth from trend slope ──────────────────
    trend_vals = trend.dropna().values
    if len(trend_vals) >= 2:
        # Simple linear slope over full trend
        x = np.arange(len(trend_vals))
        slope = float(np.polyfit(x, trend_vals, 1)[0])
        yoy_growth = round((slope * 12 / float(np.mean(trend_vals))) * 100, 2) if float(np.mean(trend_vals)) != 0 else 0.0
    else:
        yoy_growth = 0.0

    # ── Forecast: extend trend linearly + seasonal pattern ────
    last_period = series.index[-1]
    last_trend  = float(trend.iloc[-1])
    slope_per_m = slope if len(trend_vals) >= 2 else 0.0

    # Residual std for CI
    res_std = float(np.std(residual.dropna())) if len(residual.dropna()) > 1 else 0.0
    z95     = 1.96

    forecast = []
    for h in range(1, FORECAST_YEARS * PERIOD + 1):
        future_period = last_period + h
        month_idx     = future_period.month          # 1-12
        seas_comp     = float(np.mean(monthly_seasonal[month_idx])) if monthly_seasonal[month_idx] else 0.0
        predicted     = max(0.0, last_trend + slope_per_m * h + seas_comp)
        forecast.append({
            "period":    str(future_period),
            "predicted": round(predicted, 2),
            "lower":     round(max(0.0, predicted - z95 * res_std), 2),
            "upper":     round(predicted + z95 * res_std, 2),
        })

    # ── Per-year totals for multi-year comparison ──────────────
    year_totals: dict[int, float] = {}
    for i in range(n):
        yr  = series.index[i].year
        year_totals[yr] = year_totals.get(yr, 0.0) + float(series.iloc[i])

    years_comparison = [
        {"year": yr, "total": round(tot, 2)}
        for yr, tot in sorted(year_totals.items())
    ]

    return {
        "success":          True,
        "decomposition":    decomp,
        "seasonal_index":   seasonal_index,
        "forecast":         forecast,
        "peak_month":       peak_m,
        "trough_month":     trough_m,
        "yoy_growth":       yoy_growth,
        "years_comparison": years_comparison,
        "n_train":          n,
    }


def main():
    """
    stdin:  { "dates": ["2020-01",...], "quantities": [120,...] }
    stdout: JSON result
    """
    try:
        payload    = json.loads(sys.stdin.read())
        result     = run_seasonal_analysis(payload["dates"], payload["quantities"])
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
