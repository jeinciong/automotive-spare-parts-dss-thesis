"""
ARIMA + XGBoost Hybrid Forecasting Model
Use for: SMOOTH or ERRATIC demand (ADI < 1.32)
How it works:
  1. ARIMA captures linear structure (trend + autocorrelation)
  2. XGBoost corrects non-linear residuals
  3. Final = ARIMA forecast + XGB residual correction

This module supports both:
  - on-demand fitting + forecasting via fit_and_forecast()
  - separate training + artifact saving via train_and_save_model()
"""
import json
import pickle
import re
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm
warnings.filterwarnings("ignore")

# ── Configuration ──────────────────────────────────────────────
ARIMA_ORDERS_INITIAL  = [(1,1,1),(2,1,1),(1,1,2),(2,1,2),(0,1,1),(1,0,0)]
ARIMA_ORDERS_EXTENDED = [(3,1,1),(3,1,2),(2,1,3),(1,2,1),(2,2,1),(0,2,1),(3,0,1),(1,0,1)]

POOR_MAPE_THRESHOLD = 25.0   # % — retrain if first-pass MAPE is above this

XGB_PARAMS_INITIAL = {
    "n_estimators": 70, "max_depth": 3, "learning_rate": 0.05,
    "subsample": 0.8, "colsample_bytree": 0.8, 
    "min_child_weight": 2,"reg_lambda": 2.5, 
    "tree_method": "hist","random_state": 42, "verbosity": 0,
}
XGB_PARAMS_RETRAIN = {
    "n_estimators": 150, "max_depth": 3, "learning_rate": 0.025,
    "subsample": 0.75, "colsample_bytree": 0.75,
    "min_child_weight": 3, "gamma": 0.3, "reg_alpha": 0.2, "reg_lambda": 3.5,
    "tree_method": "hist", "random_state": 42, "verbosity": 0,
}

LAG_FEATURES    = [1, 2, 3, 6, 12]
ROLLING_WINDOWS = [3, 6]
ALPHA    = 0.05
MIN_OBS  = 12
# ───────────────────────────────────────────────────────────────


def _extract(window):
    feats = [window[-lag] if len(window) >= lag else 0.0 for lag in LAG_FEATURES]
    for w in ROLLING_WINDOWS:
        sl = window[-w:] if len(window) >= w else window
        feats.append(float(np.mean(sl)))
        feats.append(float(np.std(sl)) if len(sl) > 1 else 0.0)
    return feats


def _slugify_name(value):
    slug = re.sub(r"[^a-z0-9]+", "_", str(value).strip().lower()).strip("_")
    return slug or "arima_xgb_model"


def _default_model_path(product_name=None):
    base_dir = Path(__file__).resolve().parent.parent / "trained_models" / "arima_xgb"
    file_name = f"{_slugify_name(product_name)}.pkl" if product_name else "arima_xgb_model.pkl"
    return base_dir / file_name


def _fit_arima_xgb(series, arima_orders, xgb_params, horizon):
    """Core fit routine. Returns (artifact, forecasts, model_meta, mape) or raises."""
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
    scaler = None
    model = None
    xgb_enabled = False
    if len(df) >= 3:
        scaler = StandardScaler()
        X_sc   = scaler.fit_transform(df[feat_cols])
        model  = xgb.XGBRegressor(**xgb_params)
        model.fit(X_sc, df["v"])
        xgb_enabled = True
        window = list(residuals)
        for i in range(horizon):
            feat = _extract(window)
            f_sc = scaler.transform([feat])
            pred = float(model.predict(f_sc)[0])
            xgb_corrections[i] = pred
            window.append(pred)
    else:
        window = list(residuals)

    final   = arima_fc + xgb_corrections
    residual_std = float(np.std(residuals))
    ci_hw   = norm.ppf(1 - ALPHA / 2) * residual_std
    last    = series.index[-1]
    periods = [str(last + i) for i in range(1, horizon + 1)]

    forecasts = [
        {"period":    p,
         "predicted": round(max(0.0, float(v)), 2),
         "lower":     round(max(0.0, float(v) - ci_hw), 2),
         "upper":     round(float(v) + ci_hw, 2)}
        for p, v in zip(periods, final)
    ]

    # Compute hybrid fitted values (ARIMA + XGB) for accurate MAPE
    hybrid_fitted = arima_fitted.copy()
    if xgb_enabled and model is not None and scaler is not None and len(df) >= 3:
        xgb_train_preds = model.predict(scaler.transform(df[feat_cols]))
        for j, idx in enumerate(df.index):
            hybrid_fitted[idx] += float(xgb_train_preds[j])

    nz_pairs = [(float(series.values[i]), float(hybrid_fitted[i]))
                for i in range(len(series)) if float(series.values[i]) != 0]
    mape = (sum(abs((a - p) / a) for a, p in nz_pairs) / len(nz_pairs) * 100) if nz_pairs else None

    meta = {
        "algorithm":   "ARIMA_XGB",
        "arima_order": list(best_order),
        "arima_aic":   round(float(best_aic), 4),
        "n_train":     len(series),
        "horizon":     horizon,
        "mape":        round(mape, 2) if mape is not None else None,
        "accuracy":    round(100 - mape, 2) if mape is not None else None,
        "xgb_enabled": bool(xgb_enabled),
    }
    artifact = {
        "algorithm": "ARIMA_XGB",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "series_dates": [str(idx) for idx in series.index],
        "series_values": [float(v) for v in series.values],
        "last_period": str(last),
        "arima_order": list(best_order),
        "arima_aic": float(best_aic),
        "residual_std": residual_std,
        "residual_window": list(window),
        "lag_features": list(LAG_FEATURES),
        "rolling_windows": list(ROLLING_WINDOWS),
        "xgb_enabled": xgb_enabled,
        "feature_columns": feat_cols,
        "arima_result": best_result,
        "xgb_model": model,
        "xgb_scaler": scaler,
        "xgb_params": dict(xgb_params),
        "meta": dict(meta),
    }
    return artifact, forecasts, meta, mape


def forecast_from_artifact(artifact, horizon=None, current_last_period=None):
    horizon = int(horizon or artifact.get("meta", {}).get("horizon", 6))
    arima_result = artifact["arima_result"]

    # Determine how many months the artifact lags behind current data
    artifact_last = str(artifact.get("last_period", ""))
    effective_last = current_last_period or artifact_last
    skip_steps = 0
    if current_last_period and artifact_last and current_last_period > artifact_last:
        try:
            ay, am = int(artifact_last[:4]), int(artifact_last[5:7])
            cy, cm = int(current_last_period[:4]), int(current_last_period[5:7])
            skip_steps = max(0, (cy - ay) * 12 + (cm - am))
        except (ValueError, IndexError):
            skip_steps = 0

    total_steps = skip_steps + horizon
    arima_fc_full = arima_result.get_forecast(steps=total_steps).predicted_mean.values
    arima_fc = arima_fc_full[skip_steps:]

    xgb_corrections = np.zeros(horizon)
    window = list(artifact.get("residual_window", []))
    model = artifact.get("xgb_model")
    scaler = artifact.get("xgb_scaler")
    if artifact.get("xgb_enabled") and model is not None and scaler is not None:
        # Advance window through skipped (stale) months
        for _ in range(skip_steps):
            feat = _extract(window)
            pred = float(model.predict(scaler.transform([feat]))[0])
            window.append(pred)
        # Generate corrections for the requested horizon
        for i in range(horizon):
            feat = _extract(window)
            pred = float(model.predict(scaler.transform([feat]))[0])
            xgb_corrections[i] = pred
            window.append(pred)

    final = arima_fc + xgb_corrections
    ci_hw = norm.ppf(1 - ALPHA / 2) * float(artifact.get("residual_std", 0.0))
    last = pd.Period(effective_last, freq="M")
    periods = [str(last + i) for i in range(1, horizon + 1)]
    return [
        {
            "period": p,
            "predicted": round(max(0.0, float(v)), 2),
            "lower": round(max(0.0, float(v) - ci_hw), 2),
            "upper": round(float(v) + ci_hw, 2),
        }
        for p, v in zip(periods, final)
    ]


def train_model(dates, quantities, horizon=6, arima_orders=None, xgb_params=None):
    series = pd.Series(
        [float(q) for q in quantities],
        index=pd.PeriodIndex(dates, freq="M"),
    )
    if len(series) < MIN_OBS:
        raise ValueError(f"Need >= {MIN_OBS} observations, got {len(series)}")

    artifact, forecasts, meta, mape = _fit_arima_xgb(
        series,
        arima_orders or ARIMA_ORDERS_INITIAL,
        xgb_params or XGB_PARAMS_INITIAL,
        int(horizon),
    )
    return artifact, forecasts, meta, mape


def save_trained_model(artifact, output_path):
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("wb") as handle:
        pickle.dump(artifact, handle)
    return str(output)


def load_trained_model(model_path):
    with Path(model_path).open("rb") as handle:
        return pickle.load(handle)


def train_and_save_model(dates, quantities, horizon=6, product_name=None, output_path=None):
    try:
        from statsmodels.tsa.arima.model import ARIMA  # noqa
        import xgboost  # noqa
        from sklearn.preprocessing import StandardScaler  # noqa
    except ImportError as e:
        return {"success": False, "error": f"Missing package: {e}"}

    try:
        series = pd.Series(
            [float(q) for q in quantities],
            index=pd.PeriodIndex(dates, freq="M"),
        )
        if len(series) < MIN_OBS:
            return {"success": False, "error": f"Need >= {MIN_OBS} observations, got {len(series)}"}

        artifact, forecasts, meta, mape = _fit_arima_xgb(
            series, ARIMA_ORDERS_INITIAL, XGB_PARAMS_INITIAL, int(horizon)
        )

        retrained = False
        retrain_improved = False
        initial_mape = mape
        if mape is not None and mape >= POOR_MAPE_THRESHOLD:
            retrained = True
            all_orders = ARIMA_ORDERS_INITIAL + ARIMA_ORDERS_EXTENDED
            try:
                artifact2, fc2, meta2, mape2 = _fit_arima_xgb(
                    series, all_orders, XGB_PARAMS_RETRAIN, int(horizon)
                )
                if mape2 is not None and mape2 < (mape or np.inf):
                    artifact, forecasts, meta, mape = artifact2, fc2, meta2, mape2
                    retrain_improved = True
            except Exception:
                pass

        meta["retrained"] = bool(retrained)
        meta["retrain_improved"] = bool(retrain_improved)
        meta["initial_mape"] = round(initial_mape, 2) if initial_mape is not None else None
        meta["low_accuracy"] = bool(mape is not None and mape >= POOR_MAPE_THRESHOLD)
        artifact["meta"] = dict(meta)

        model_path = Path(output_path) if output_path else _default_model_path(product_name)
        saved_path = save_trained_model(artifact, model_path)
        meta["saved_model_path"] = saved_path
        return {
            "success": True,
            "forecasts": forecasts,
            "model_info": meta,
            "saved_model_path": saved_path,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


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
        artifact, forecasts, meta, mape = _fit_arima_xgb(
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
                artifact2, fc2, meta2, mape2 = _fit_arima_xgb(
                    series, all_orders, XGB_PARAMS_RETRAIN, horizon
                )
                # Keep whichever pass has lower MAPE
                if mape2 is not None and mape2 < (mape or np.inf):
                    artifact, forecasts, meta, mape = artifact2, fc2, meta2, mape2
                    retrain_improved = True
            except Exception:
                pass  # retrain failed — keep first-pass result

        meta["retrained"]           = bool(retrained)
        meta["retrain_improved"]    = bool(retrain_improved)
        meta["initial_mape"]        = round(initial_mape, 2) if initial_mape is not None else None
        meta["low_accuracy"]        = bool(mape is not None and mape >= POOR_MAPE_THRESHOLD)

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
