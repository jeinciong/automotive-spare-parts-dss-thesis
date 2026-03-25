"""
ARIMA + XGBoost Hybrid Forecasting Model
Use for: SMOOTH or ERRATIC demand (ADI < 1.32)
How it works:
  1. ARIMA captures linear structure (trend + autocorrelation)
  2. XGBoost corrects non-linear residuals
  3. Final = ARIMA forecast + XGB residual correction

Auto-retrain:
  If initial MAPE >= POOR_MAPE_THRESHOLD the model automatically
  retries with an expanded ARIMA order search space and stronger
  XGBoost regularisation. The best of both runs is returned.
  The response includes:
    retrained   : bool   — True if the retrain pass was triggered
    retrain_improved : bool — True if retrain beat initial run

Modify:
  ARIMA_ORDERS_INITIAL  - first-pass candidate (p,d,q) tuples
  ARIMA_ORDERS_EXTENDED - retrain-pass additional orders
  POOR_MAPE_THRESHOLD   - MAPE % above which retrain is triggered (default 25)
  XGB_PARAMS_INITIAL    - first-pass XGBoost params
  XGB_PARAMS_RETRAIN    - retrain-pass XGBoost params (more regularisation)
  ALPHA                 - confidence interval level (0.05 = 95%)
"""
import sys, json, warnings
import numpy as np
import pandas as pd
from scipy.stats import norm
warnings.filterwarnings("ignore")

# ── Configuration ──────────────────────────────────────────────
ARIMA_ORDERS_INITIAL  = [(1,1,1),(2,1,1),(1,1,2),(2,1,2),(0,1,1),(1,0,0)]
ARIMA_ORDERS_EXTENDED = [(3,1,1),(3,1,2),(2,1,3),(1,2,1),(2,2,1),(0,2,1),(3,0,1),(1,0,1)]

POOR_MAPE_THRESHOLD = 25.0   # % — retrain if first-pass MAPE is above this

XGB_PARAMS_INITIAL = {
    "n_estimators": 200, "max_depth": 4, "learning_rate": 0.05,
    "subsample": 0.8, "colsample_bytree": 0.8,
    "random_state": 42, "verbosity": 0,
}
XGB_PARAMS_RETRAIN = {
    "n_estimators": 400, "max_depth": 3, "learning_rate": 0.02,
    "subsample": 0.7, "colsample_bytree": 0.7,
    "min_child_weight": 3, "gamma": 0.1, "reg_alpha": 0.1, "reg_lambda": 1.5,
    "random_state": 42, "verbosity": 0,
}

LAG_FEATURES    = [1, 2, 3, 6, 12]
ROLLING_WINDOWS = [3, 6]
ALPHA    = 0.05
MIN_OBS  = 12
# ───────────────────────────────────────────────────────────────


def _fit_arima_xgb(series, arima_orders, xgb_params, horizon):
    """Core fit routine. Returns (forecasts, model_meta, mape) or raises."""
    from statsmodels.tsa.arima.model import ARIMA
    import xgboost as xgb
    from sklearn.preprocessing import StandardScaler

    # ARIMA: grid-search by AIC
    best_aic, best_result, best_order = np.inf, None, arima_orders[0]
    for order in arima_orders:
        try:
            r = ARIMA(series, order=order).fit()
            if r.aic < best_aic:
                best_aic, best_result, best_order = r.aic, r, order
        except Exception:
            continue
    if best_result is None:
        raise RuntimeError("All ARIMA orders failed")

    arima_fitted = best_result.fittedvalues.values
    arima_fc     = best_result.get_forecast(steps=horizon).predicted_mean.values

    # XGB on residuals
    residuals  = series.values - arima_fitted
    res_series = pd.Series(residuals)
    df = pd.DataFrame({"v": res_series})
    for lag in LAG_FEATURES:
        df[f"lag_{lag}"] = df["v"].shift(lag)
    for w in ROLLING_WINDOWS:
        df[f"rmean_{w}"] = df["v"].shift(1).rolling(w).mean()
        df[f"rstd_{w}"]  = df["v"].shift(1).rolling(w).std()
    df = df.dropna()
    feat_cols = [c for c in df.columns if c != "v"]

    xgb_corrections = np.zeros(horizon)
    if len(df) >= 3:
        scaler = StandardScaler()
        X_sc   = scaler.fit_transform(df[feat_cols])
        model  = xgb.XGBRegressor(**xgb_params)
        model.fit(X_sc, df["v"])
        window = list(residuals)
        for i in range(horizon):
            feat = _extract(window)
            f_sc = scaler.transform([feat])
            pred = float(model.predict(f_sc)[0])
            xgb_corrections[i] = pred
            window.append(pred)

    final   = arima_fc + xgb_corrections
    ci_hw   = norm.ppf(1 - ALPHA / 2) * float(np.std(residuals))
    last    = series.index[-1]
    periods = [str(last + i) for i in range(1, horizon + 1)]

    forecasts = [
        {"period":    p,
         "predicted": round(max(0.0, float(v)), 2),
         "lower":     round(max(0.0, float(v) - ci_hw), 2),
         "upper":     round(float(v) + ci_hw, 2)}
        for p, v in zip(periods, final)
    ]

    nz_pairs = [(float(series.values[i]), float(arima_fitted[i]))
                for i in range(len(series)) if float(series.values[i]) != 0]
    mape = (sum(abs((a - p) / a) for a, p in nz_pairs) / len(nz_pairs) * 100) if nz_pairs else None

    meta = {
        "algorithm":   "ARIMA_XGB",
        "arima_order": list(best_order),
        "n_train":     len(series),
        "horizon":     horizon,
        "mape":        round(mape, 2) if mape is not None else None,
        "accuracy":    round(100 - mape, 2) if mape is not None else None,
    }
    return forecasts, meta, mape


def _extract(window):
    feats = [window[-lag] if len(window) >= lag else 0.0 for lag in LAG_FEATURES]
    for w in ROLLING_WINDOWS:
        sl = window[-w:] if len(window) >= w else window
        feats.append(float(np.mean(sl)))
        feats.append(float(np.std(sl)) if len(sl) > 1 else 0.0)
    return feats


def fit_and_forecast(dates, quantities, horizon=6):
    try:
        from statsmodels.tsa.arima.model import ARIMA  # noqa — import check
        import xgboost  # noqa
        from sklearn.preprocessing import StandardScaler  # noqa
    except ImportError as e:
        return {"success": False, "error": f"Missing package: {e}"}

    series = pd.Series(
        [float(q) for q in quantities],
        index=pd.PeriodIndex(dates, freq="M"),
    )
    if len(series) < MIN_OBS:
        return {"success": False, "error": f"Need >= {MIN_OBS} observations, got {len(series)}"}

    try:
        # ── First pass ──────────────────────────────────────────
        forecasts, meta, mape = _fit_arima_xgb(
            series, ARIMA_ORDERS_INITIAL, XGB_PARAMS_INITIAL, horizon
        )

        retrained        = False
        retrain_improved = False
        initial_mape     = mape

        # ── Auto-retrain if MAPE is too high ────────────────────
        if mape is not None and mape >= POOR_MAPE_THRESHOLD:
            retrained = True
            all_orders = ARIMA_ORDERS_INITIAL + ARIMA_ORDERS_EXTENDED
            try:
                fc2, meta2, mape2 = _fit_arima_xgb(
                    series, all_orders, XGB_PARAMS_RETRAIN, horizon
                )
                # Keep whichever pass has lower MAPE
                if mape2 is not None and mape2 < (mape or np.inf):
                    forecasts, meta, mape = fc2, meta2, mape2
                    retrain_improved = True
            except Exception:
                pass  # retrain failed — keep first-pass result

        meta["retrained"]           = retrained
        meta["retrain_improved"]    = retrain_improved
        meta["initial_mape"]        = round(initial_mape, 2) if initial_mape is not None else None
        meta["low_accuracy"]        = (mape is not None and mape >= POOR_MAPE_THRESHOLD)

        return {"success": True, "forecasts": forecasts, "model_info": meta}

    except Exception as e:
        return {"success": False, "error": str(e)}


def main():
    try:
        payload = json.loads(sys.stdin.read())
        result  = fit_and_forecast(
            payload["dates"], payload["quantities"],
            int(payload.get("horizon", 6)),
        )
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
