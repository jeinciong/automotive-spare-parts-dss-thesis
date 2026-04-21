"""
TSB (Teunter-Syntetos-Babai) + XGBoost Hybrid Model
Use for: INTERMITTENT or LUMPY demand (ADI >= 1.32)

This module supports both:
  - on-demand fitting + forecasting via fit_and_forecast()
  - separate training + artifact saving via train_and_save_model()
"""
import json
import pickle
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm
from itertools import product as cartesian

# ── Configuration ───────────────────────────────────────────────
ALPHA_GRID_INITIAL  = [0.1, 0.2, 0.3, 0.4, 0.5]
BETA_GRID_INITIAL   = [0.1, 0.2, 0.3, 0.4, 0.5]
ALPHA_GRID_EXTENDED = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7]
BETA_GRID_EXTENDED  = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7]

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
CI_ALPHA = 0.05
MIN_OBS  = 12
# ────────────────────────────────────────────────────────────────


def run_tsb(series, alpha, beta):
    """TSB algorithm: returns fitted values array."""
    n  = len(series)
    z  = np.zeros(n)
    p  = np.zeros(n)
    nz = [s for s in series if s > 0]
    z[0] = nz[0] if nz else 1.0
    p[0] = len(nz) / n
    for t in range(1, n):
        if series[t] > 0:
            z[t] = alpha * series[t] + (1 - alpha) * z[t - 1]
            p[t] = beta + (1 - beta) * p[t - 1]
        else:
            z[t] = z[t - 1]
            p[t] = (1 - beta) * p[t - 1]
    return p * z


def _extract(window):
    feats = [window[-lag] if len(window) >= lag else 0.0 for lag in LAG_FEATURES]
    for w in ROLLING_WINDOWS:
        sl = window[-w:] if len(window) >= w else window
        feats.append(float(np.mean(sl)))
        feats.append(float(np.std(sl)) if len(sl) > 1 else 0.0)
    return feats


def _slugify_name(value):
    slug = re.sub(r"[^a-z0-9]+", "_", str(value).strip().lower()).strip("_")
    return slug or "tsb_xgb_model"


def _default_model_path(product_name=None):
    base_dir = Path(__file__).resolve().parent.parent / "trained_models" / "tsb_xgb"
    file_name = f"{_slugify_name(product_name)}.pkl" if product_name else "tsb_xgb_model.pkl"
    return base_dir / file_name


def _fit_tsb_xgb(series, alpha_grid, beta_grid, xgb_params, horizon, dates):
    """Core fit routine. Returns (artifact, forecasts, model_meta, mape) or raises."""
    import xgboost as xgb
    from sklearn.preprocessing import StandardScaler

    # Grid-search best alpha/beta by MSE
    best_mse, best_alpha, best_beta = np.inf, alpha_grid[0], beta_grid[0]
    for alpha, beta in cartesian(alpha_grid, beta_grid):
        fitted = run_tsb(series, alpha, beta)
        mse    = float(np.mean((series - fitted) ** 2))
        if mse < best_mse:
            best_mse, best_alpha, best_beta = mse, alpha, beta

    tsb_fitted = run_tsb(series, best_alpha, best_beta)
    residuals  = series - tsb_fitted

    # XGB on residuals
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

    tsb_fc  = np.full(horizon, float(tsb_fitted[-1]))
    final   = tsb_fc + xgb_corrections
    residual_std = float(np.std(residuals))
    ci_hw   = norm.ppf(1 - CI_ALPHA / 2) * residual_std
    last    = pd.Period(dates[-1], freq="M")
    periods = [str(last + i) for i in range(1, horizon + 1)]

    forecasts = [
        {"period":    p,
         "predicted": round(max(0.0, float(v)), 2),
         "lower":     round(max(0.0, float(v) - ci_hw), 2),
         "upper":     round(float(v) + ci_hw, 2)}
        for p, v in zip(periods, final)
    ]

    nz_pairs = [(series[i], tsb_fitted[i]) for i in range(len(series)) if series[i] != 0]
    mape = (sum(abs((a - p) / a) for a, p in nz_pairs) / len(nz_pairs) * 100) if nz_pairs else None

    meta = {
        "algorithm":  "TSB_XGB",
        "tsb_alpha":  round(best_alpha, 3),
        "tsb_beta":   round(best_beta, 3),
        "tsb_mse":    round(best_mse, 4),
        "n_train":    len(series),
        "horizon":    horizon,
        "mape":       round(mape, 2) if mape is not None else None,
        "accuracy":   round(100 - mape, 2) if mape is not None else None,
        "xgb_enabled": bool(xgb_enabled),
    }
    artifact = {
        "algorithm": "TSB_XGB",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "series_dates": [str(d) for d in dates],
        "series_values": [float(v) for v in series],
        "last_period": str(last),
        "tsb_alpha": float(best_alpha),
        "tsb_beta": float(best_beta),
        "tsb_level": float(tsb_fitted[-1]),
        "tsb_mse": float(best_mse),
        "residual_std": residual_std,
        "residual_window": list(window),
        "lag_features": list(LAG_FEATURES),
        "rolling_windows": list(ROLLING_WINDOWS),
        "xgb_enabled": xgb_enabled,
        "feature_columns": feat_cols,
        "xgb_model": model,
        "xgb_scaler": scaler,
        "xgb_params": dict(xgb_params),
        "meta": dict(meta),
    }
    return artifact, forecasts, meta, mape


def forecast_from_artifact(artifact, horizon=None):
    horizon = int(horizon or artifact.get("meta", {}).get("horizon", 6))
    tsb_fc = np.full(horizon, float(artifact["tsb_level"]))

    xgb_corrections = np.zeros(horizon)
    window = list(artifact.get("residual_window", []))
    model = artifact.get("xgb_model")
    scaler = artifact.get("xgb_scaler")
    if artifact.get("xgb_enabled") and model is not None and scaler is not None:
        for i in range(horizon):
            feat = _extract(window)
            pred = float(model.predict(scaler.transform([feat]))[0])
            xgb_corrections[i] = pred
            window.append(pred)

    final = tsb_fc + xgb_corrections
    ci_hw = norm.ppf(1 - CI_ALPHA / 2) * float(artifact.get("residual_std", 0.0))
    last = pd.Period(artifact["last_period"], freq="M")
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


def train_model(dates, quantities, horizon=6, alpha_grid=None, beta_grid=None, xgb_params=None):
    series = np.array([float(q) for q in quantities])
    if len(series) < MIN_OBS:
        raise ValueError(f"Need >= {MIN_OBS} observations, got {len(series)}")

    artifact, forecasts, meta, mape = _fit_tsb_xgb(
        series,
        alpha_grid or ALPHA_GRID_INITIAL,
        beta_grid or BETA_GRID_INITIAL,
        xgb_params or XGB_PARAMS_INITIAL,
        int(horizon),
        dates,
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
        import xgboost  # noqa
        from sklearn.preprocessing import StandardScaler  # noqa
    except ImportError as e:
        return {"success": False, "error": f"Missing package: {e}"}

    try:
        series = np.array([float(q) for q in quantities])
        if len(series) < MIN_OBS:
            return {"success": False, "error": f"Need >= {MIN_OBS} observations, got {len(series)}"}

        artifact, forecasts, meta, mape = _fit_tsb_xgb(
            series, ALPHA_GRID_INITIAL, BETA_GRID_INITIAL,
            XGB_PARAMS_INITIAL, int(horizon), dates,
        )

        retrained = False
        retrain_improved = False
        initial_mape = mape
        if mape is not None and mape >= POOR_MAPE_THRESHOLD:
            retrained = True
            try:
                artifact2, fc2, meta2, mape2 = _fit_tsb_xgb(
                    series, ALPHA_GRID_EXTENDED, BETA_GRID_EXTENDED,
                    XGB_PARAMS_RETRAIN, int(horizon), dates,
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
        import xgboost   # noqa — import check
        from sklearn.preprocessing import StandardScaler  # noqa
    except ImportError as e:
        return {"success": False, "error": f"Missing package: {e}"}

    series = np.array([float(q) for q in quantities])
    if len(series) < MIN_OBS:
        return {"success": False, "error": f"Need >= {MIN_OBS} observations"}

    try:
        # ── First pass ──────────────────────────────────────────
        artifact, forecasts, meta, mape = _fit_tsb_xgb(
            series, ALPHA_GRID_INITIAL, BETA_GRID_INITIAL,
            XGB_PARAMS_INITIAL, horizon, dates,
        )

        retrained        = False
        retrain_improved = False
        initial_mape     = mape

        # ── Auto-retrain if MAPE is too high ────────────────────
        if mape is not None and mape >= POOR_MAPE_THRESHOLD:
            retrained = True
            try:
                artifact2, fc2, meta2, mape2 = _fit_tsb_xgb(
                    series, ALPHA_GRID_EXTENDED, BETA_GRID_EXTENDED,
                    XGB_PARAMS_RETRAIN, horizon, dates,
                )
                if mape2 is not None and mape2 < (mape or np.inf):
                    artifact, forecasts, meta, mape = artifact2, fc2, meta2, mape2
                    retrain_improved = True
            except Exception:
                pass  # keep first-pass result

        meta["retrained"]        = bool(retrained)
        meta["retrain_improved"] = bool(retrain_improved)
        meta["initial_mape"]     = round(initial_mape, 2) if initial_mape is not None else None
        meta["low_accuracy"]     = bool(mape is not None and mape >= POOR_MAPE_THRESHOLD)

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
