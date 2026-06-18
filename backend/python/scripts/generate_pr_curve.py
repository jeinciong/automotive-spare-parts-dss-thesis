import os
import sys
import re
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import precision_recall_curve, average_precision_score, f1_score
from scipy.stats import t as t_dist

# Resolve paths
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parents[1]  # autoparts-backend
PROJECT_ROOT = BACKEND_DIR.parent    # automotive-spare-parts-dss-thesis

# Add paths for python modules
PYTHON_ROOT = BACKEND_DIR / "python"
sys.path.append(str(PYTHON_ROOT))
sys.path.append(str(PYTHON_ROOT / "models"))
sys.path.append(str(PYTHON_ROOT / "utils"))

# Import system models & utils
try:
    from arima_xgb_model import train_model as train_arima_xgb
    from arima_xgb_model import forecast_from_artifact as forecast_arima_xgb
    from arima_xgb_model import XGB_PARAMS_INITIAL as ARIMA_XGB_PARAMS_INITIAL
    from arima_xgb_model import XGB_PARAMS_RETRAIN as ARIMA_XGB_PARAMS_RETRAIN
    from arima_xgb_model import ARIMA_ORDERS_INITIAL, ARIMA_ORDERS_EXTENDED
    
    from tsb_xgb_model import train_model as train_tsb_xgb
    from tsb_xgb_model import forecast_from_artifact as forecast_tsb_xgb
    from tsb_xgb_model import XGB_PARAMS_INITIAL as TSB_XGB_PARAMS_INITIAL
    from tsb_xgb_model import XGB_PARAMS_RETRAIN as TSB_XGB_PARAMS_RETRAIN
    from tsb_xgb_model import ALPHA_GRID_INITIAL, BETA_GRID_INITIAL, ALPHA_GRID_EXTENDED, BETA_GRID_EXTENDED
    
    from demand_classifier import classify
except ImportError as e:
    print(f"Error importing modules: {e}")
    print(f"sys.path: {sys.path}")
    sys.exit(1)

# Constants matching the notebook config
DATA_PATH = PYTHON_ROOT / "data" / "revised_sales_2.csv"
DATE_COLUMN = "reportDate"
QUANTITY_COLUMN = "quantity"
PRODUCT_COLUMN = "productName"
TOTAL_AMOUNT_COLUMN = "totalAmount"
BUSINESS_REVENUE_NAME = "Business Total Revenue"
BUSINESS_REVENUE_ARTIFACT_NAME = "monthly_total_revenue"

MIN_TRAIN_SIZE = 12
MAX_WALK_FORWARD_EPOCHS = 12
FORECAST_HORIZON = 6
LOG_LOSS_COLUMN = "LogLoss"
WINDOW_SELECTION_METRIC = "WAPE"
WINDOW_SELECTION_TIEBREAKERS = ["MAPE", "RMSE"]

TRAINING_WINDOW_CANDIDATES_BY_DEMAND_TYPE = {
    "SMOOTH": [None, 48, 36, 24],
    "ERRATIC": [None, 48, 36, 24, 18],
    "INTERMITTENT": [None, 36, 24, 18, 12],
    "LUMPY": [None, 36, 24, 18, 12],
}
TRAINING_WINDOW_CANDIDATES_BY_SERIES_KIND = {
    "business_revenue": [None, 48, 36, 24],
}

def slugify_name(value):
    slug = re.sub(r"[^a-z0-9]+", "_", str(value).strip().lower()).strip("_")
    return slug or "forecast_model"

def recommended_walk_forward_epochs(n_observations, min_train_size=12, max_walk_forward_epochs=12):
    available = max(0, int(n_observations) - int(min_train_size))
    return max(1, min(available, int(max_walk_forward_epochs)))

def load_sales_data(data_path):
    df = pd.read_csv(data_path)
    working = df.copy()
    working[DATE_COLUMN] = pd.to_datetime(working[DATE_COLUMN])
    working[QUANTITY_COLUMN] = pd.to_numeric(working[QUANTITY_COLUMN], errors="coerce").fillna(0.0)
    working[PRODUCT_COLUMN] = working[PRODUCT_COLUMN].astype(str).str.strip()
    working["period"] = working[DATE_COLUMN].dt.to_period("M")

    monthly = (
        working.groupby([PRODUCT_COLUMN, "period"], as_index=False)[QUANTITY_COLUMN]
        .sum()
        .sort_values([PRODUCT_COLUMN, "period"])
        .reset_index(drop=True)
    )
    monthly["period_str"] = monthly["period"].astype(str)
    monthly[QUANTITY_COLUMN] = monthly[QUANTITY_COLUMN].astype(float)
    return monthly

def load_business_revenue_series(data_path):
    df = pd.read_csv(data_path)
    working = df.copy()
    working[DATE_COLUMN] = pd.to_datetime(working[DATE_COLUMN])
    working[TOTAL_AMOUNT_COLUMN] = pd.to_numeric(working[TOTAL_AMOUNT_COLUMN], errors="coerce").fillna(0.0)
    working["period"] = working[DATE_COLUMN].dt.to_period("M")

    revenue = (
        working.groupby("period", as_index=False)[TOTAL_AMOUNT_COLUMN]
        .sum()
        .sort_values("period")
        .reset_index(drop=True)
    )

    revenue[PRODUCT_COLUMN] = BUSINESS_REVENUE_NAME
    revenue[QUANTITY_COLUMN] = revenue[TOTAL_AMOUNT_COLUMN].astype(float)
    revenue["period_str"] = revenue["period"].astype(str)
    return revenue[[PRODUCT_COLUMN, "period", QUANTITY_COLUMN, "period_str", TOTAL_AMOUNT_COLUMN]]

def compute_log_loss(actual, predicted):
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    valid_mask = np.isfinite(actual) & np.isfinite(predicted)
    if not np.any(valid_mask):
        return np.nan

    actual = np.clip(actual[valid_mask], 0.0, None)
    predicted = np.clip(predicted[valid_mask], 0.0, None)
    return float(np.mean(np.square(np.log1p(actual) - np.log1p(predicted))))

def compute_metrics(actual, predicted):
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    errors = actual - predicted

    mse = float(np.mean(np.square(errors)))
    rmse = float(np.sqrt(mse))
    mae = float(np.mean(np.abs(errors)))
    log_loss = compute_log_loss(actual, predicted)

    non_zero_mask = actual != 0
    if np.any(non_zero_mask):
        mape = float(np.mean(np.abs(errors[non_zero_mask] / actual[non_zero_mask])) * 100)
    else:
        mape = np.nan

    denominator = (np.abs(actual) + np.abs(predicted)) / 2.0
    valid_smape = denominator != 0
    if np.any(valid_smape):
        smape = float(np.mean(np.abs(errors[valid_smape]) / denominator[valid_smape]) * 100)
    else:
        smape = 0.0

    actual_sum = np.sum(np.abs(actual))
    if actual_sum != 0:
        wape = float(np.sum(np.abs(errors)) / actual_sum * 100)
    else:
        wape = np.nan

    # R² (Coefficient of Determination)
    ss_res = float(np.sum(np.square(errors)))
    ss_tot = float(np.sum(np.square(actual - np.mean(actual))))
    r_squared = float(1.0 - (ss_res / ss_tot)) if ss_tot > 0 else 0.0

    return {"RMSE": rmse, "MSE": mse, "MAE": mae, "MAPE": mape, "sMAPE": smape, "WAPE": wape, "R²": r_squared, LOG_LOSS_COLUMN: log_loss}


def _sfmt(value, decimals=4):
    """Safe format for report values that may be NaN/None."""
    try:
        if value is None or (isinstance(value, float) and (np.isnan(value) or np.isinf(value))):
            return "N/A"
        return f"{value:.{decimals}f}"
    except (TypeError, ValueError):
        return str(value)


def standalone_forecast_from_artifact(artifact):
    """Extract the base-model-only (no XGB correction) 1-step forecast from a trained artifact."""
    algorithm = artifact.get("algorithm", "")
    if algorithm == "ARIMA_XGB":
        arima_result = artifact.get("arima_result")
        if arima_result is not None:
            try:
                fc = arima_result.get_forecast(steps=1).predicted_mean.values[0]
                return max(0.0, float(fc))
            except Exception:
                pass
    elif algorithm == "TSB_XGB":
        level = artifact.get("tsb_level")
        if level is not None:
            return max(0.0, float(level))
    return None


def compute_mase(actual, predicted, training_series, seasonal_period=1):
    """Mean Absolute Scaled Error (Hyndman & Koehler, 2006).
    MASE < 1 means the model outperforms the in-sample naive forecast."""
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    training = np.asarray(training_series, dtype=float)

    if len(training) <= seasonal_period:
        return np.nan

    forecast_mae = float(np.mean(np.abs(actual - predicted)))
    naive_errors = np.abs(training[seasonal_period:] - training[:-seasonal_period])
    naive_mae = float(np.mean(naive_errors)) if len(naive_errors) > 0 else np.nan

    if naive_mae is None or np.isnan(naive_mae) or naive_mae == 0:
        return np.nan

    return float(forecast_mae / naive_mae)


def diebold_mariano_test(actual, pred1, pred2, h=1):
    """Diebold-Mariano test for equal predictive accuracy.
    Tests H0: both models have equal forecast accuracy.
    Returns dict with dm_statistic, p_value, significant, better_model.
    'Model 1' = pred1 is better (lower squared error),
    'Model 2' = pred2 is better."""
    actual = np.asarray(actual, dtype=float)
    pred1 = np.asarray(pred1, dtype=float)
    pred2 = np.asarray(pred2, dtype=float)

    e1 = actual - pred1
    e2 = actual - pred2
    d = e1**2 - e2**2  # loss differential: negative = pred1 is better

    n = len(d)
    if n < 3:
        return {"dm_statistic": np.nan, "p_value": np.nan, "significant": False, "better_model": "N/A"}

    mean_d = float(np.mean(d))
    var_d = float(np.var(d, ddof=1)) / n

    if var_d <= 0:
        return {"dm_statistic": np.nan, "p_value": np.nan, "significant": False, "better_model": "N/A"}

    dm_stat = mean_d / np.sqrt(var_d)
    p_value = 2.0 * (1.0 - t_dist.cdf(abs(dm_stat), df=n - 1))

    better = "Model 1" if mean_d < 0 else "Model 2" if mean_d > 0 else "Tie"

    return {
        "dm_statistic": round(float(dm_stat), 4),
        "p_value": round(float(p_value), 4),
        "significant": bool(p_value < 0.05),
        "better_model": better,
    }


def compute_component_contribution(actual, hybrid_predicted, standalone_predicted):
    """Measure XGB residual correction component's contribution to the hybrid model."""
    actual = np.asarray(actual, dtype=float)
    hybrid = np.asarray(hybrid_predicted, dtype=float)
    standalone = np.asarray(standalone_predicted, dtype=float)

    standalone_mae = float(np.mean(np.abs(actual - standalone)))
    hybrid_mae = float(np.mean(np.abs(actual - hybrid)))
    standalone_rmse = float(np.sqrt(np.mean((actual - standalone) ** 2)))
    hybrid_rmse = float(np.sqrt(np.mean((actual - hybrid) ** 2)))

    mae_reduction = standalone_mae - hybrid_mae
    mae_improvement_pct = (mae_reduction / standalone_mae * 100) if standalone_mae > 0 else 0.0
    rmse_reduction = standalone_rmse - hybrid_rmse
    rmse_improvement_pct = (rmse_reduction / standalone_rmse * 100) if standalone_rmse > 0 else 0.0

    standalone_res_var = float(np.var(actual - standalone))
    hybrid_res_var = float(np.var(actual - hybrid))
    var_reduction_pct = ((standalone_res_var - hybrid_res_var) / standalone_res_var * 100) if standalone_res_var > 0 else 0.0

    return {
        "standalone_mae": round(standalone_mae, 4),
        "hybrid_mae": round(hybrid_mae, 4),
        "mae_improvement": round(mae_reduction, 4),
        "mae_improvement_pct": round(mae_improvement_pct, 2),
        "standalone_rmse": round(standalone_rmse, 4),
        "hybrid_rmse": round(hybrid_rmse, 4),
        "rmse_improvement": round(rmse_reduction, 4),
        "rmse_improvement_pct": round(rmse_improvement_pct, 2),
        "residual_variance_reduction_pct": round(var_reduction_pct, 2),
    }


def get_training_window_candidates(demand_type, series_kind, n_observations):
    if series_kind == "business_revenue":
        candidates = TRAINING_WINDOW_CANDIDATES_BY_SERIES_KIND.get("business_revenue", [None])
    else:
        candidates = TRAINING_WINDOW_CANDIDATES_BY_DEMAND_TYPE.get(demand_type, [None])
    
    valid_candidates = []
    for c in candidates:
        if c is None or n_observations >= c + MIN_TRAIN_SIZE:
            valid_candidates.append(c)
    if not valid_candidates:
        valid_candidates = [None]
    return valid_candidates

def get_training_slice(dates, quantities, training_window):
    if training_window is None:
        return dates, quantities, 0
    start_idx = max(0, len(dates) - training_window)
    return dates[start_idx:], quantities[start_idx:], start_idx

def training_window_label(window):
    return "All History" if window is None else f"{window} Months"

def run_sequential_epochs(dates, quantities, train_fn, forecast_fn, min_train_size=12, test_size=None, training_window=None):
    test_size = int(test_size or recommended_walk_forward_epochs(len(dates), min_train_size=min_train_size, max_walk_forward_epochs=MAX_WALK_FORWARD_EPOCHS))
    if len(dates) <= min_train_size:
        raise ValueError(f"Need more than {min_train_size} monthly observations.")

    rows = []
    test_start = len(dates) - test_size

    for epoch_index, target_index in enumerate(range(test_start, len(dates)), start=1):
        if training_window is None:
            train_dates = dates[:target_index]
            train_values = quantities[:target_index]
        else:
            start_idx = max(0, target_index - training_window)
            train_dates = dates[start_idx:target_index]
            train_values = quantities[start_idx:target_index]

        target_period = dates[target_index]
        actual_value = float(quantities[target_index])

        artifact, _, meta, _ = train_fn(train_dates, train_values, horizon=1)
        training_log_loss = float(compute_metrics(artifact.get("series_values", []), arima_fitted(artifact) if artifact.get("algorithm") == "ARIMA_XGB" else tsb_fitted(artifact)).get(LOG_LOSS_COLUMN, np.nan))
        next_step = forecast_fn(artifact, horizon=1)[0]
        predicted_value = float(next_step["predicted"])
        validation_log_loss = compute_log_loss([actual_value], [predicted_value])

        # Extract standalone (base-model-only, no XGB) and naive predictions
        standalone_value = standalone_forecast_from_artifact(artifact)
        if standalone_value is None:
            standalone_value = predicted_value
        naive_value = float(quantities[target_index - 1]) if target_index > 0 else 0.0

        rows.append({
            "epoch": epoch_index,
            "target_period": target_period,
            "train_size": len(train_dates),
            "actual": actual_value,
            "predicted": predicted_value,
            "standalone_predicted": standalone_value,
            "naive_predicted": naive_value,
            "absolute_error": abs(actual_value - predicted_value),
            "training_log_loss": training_log_loss,
            "validation_log_loss": validation_log_loss,
            "meta": meta,
        })

    return pd.DataFrame(rows)

def arima_fitted(artifact):
    values = np.asarray(artifact.get("series_values", []), dtype=float)
    if artifact.get("arima_result") is not None:
        arima_fitted = np.asarray(artifact["arima_result"].fittedvalues, dtype=float)
        fitted = np.resize(arima_fitted, values.shape).astype(float)
    else:
        fitted = pd.Series(values).shift(1).bfill().fillna(0).to_numpy(dtype=float)
    return np.clip(fitted, 0.0, None)

def tsb_fitted(artifact):
    values = np.asarray(artifact.get("series_values", []), dtype=float)
    alpha = float(artifact.get("tsb_alpha", 0.1))
    beta = float(artifact.get("tsb_beta", 0.1))
    n = len(values)
    z = np.zeros(n)
    p = np.zeros(n)
    if n > 0:
        z[0] = values[0] if values[0] > 0 else 0.0
        p[0] = 1.0
    for t in range(1, n):
        if values[t - 1] > 0:
            z[t] = z[t - 1] + alpha * (values[t - 1] - z[t - 1])
            p[t] = beta + (1 - beta) * p[t - 1]
        else:
            z[t] = z[t - 1]
            p[t] = (1 - beta) * p[t - 1]
    return np.clip(p * z, 0.0, None)

def select_best_training_window(dates, quantities, train_fn, forecast_fn, demand_type, series_kind, test_size):
    candidates = get_training_window_candidates(demand_type, series_kind, len(dates))
    best_window = None
    best_metrics = None
    best_epoch_frame = None

    for window in candidates:
        epoch_frame = run_sequential_epochs(
            dates=dates,
            quantities=quantities,
            train_fn=train_fn,
            forecast_fn=forecast_fn,
            min_train_size=MIN_TRAIN_SIZE,
            test_size=test_size,
            training_window=window
        )
        metrics = compute_metrics(epoch_frame["actual"], epoch_frame["predicted"])

        if best_metrics is None:
            best_window = window
            best_metrics = metrics
            best_epoch_frame = epoch_frame
        else:
            current_val = metrics.get(WINDOW_SELECTION_METRIC, float('inf'))
            best_val = best_metrics.get(WINDOW_SELECTION_METRIC, float('inf'))
            if pd.isna(current_val): current_val = float('inf')
            if pd.isna(best_val): best_val = float('inf')

            if current_val < best_val:
                best_window = window
                best_metrics = metrics
                best_epoch_frame = epoch_frame
            elif current_val == best_val:
                for tiebreaker in WINDOW_SELECTION_TIEBREAKERS:
                    tb_current = metrics.get(tiebreaker, float('inf'))
                    tb_best = best_metrics.get(tiebreaker, float('inf'))
                    if pd.isna(tb_current): tb_current = float('inf')
                    if pd.isna(tb_best): tb_best = float('inf')
                    if tb_current < tb_best:
                        best_window = window
                        best_metrics = metrics
                        best_epoch_frame = epoch_frame
                        break

    return best_window, best_epoch_frame

def evaluate_subset_pr(df_subset):
    actuals = (df_subset["actual_class"] == "Demand").astype(int).to_numpy()
    probs = df_subset["predicted_demand_probability"].to_numpy()
    
    # Handle edge case where there is only one class in the subset
    if len(np.unique(actuals)) < 2:
        return None
        
    precision, recall, thresholds = precision_recall_curve(actuals, probs)
    ap = average_precision_score(actuals, probs)
    
    f1_scores = []
    for t in thresholds:
        preds = (probs >= t).astype(int)
        f1_scores.append(f1_score(actuals, preds))
        
    best_idx = np.argmax(f1_scores) if f1_scores else 0
    opt_threshold = thresholds[best_idx] if len(thresholds) > 0 else 0.5
    opt_f1 = f1_scores[best_idx] if f1_scores else 0.0
    opt_prec = precision[best_idx]
    opt_rec = recall[best_idx]
    
    # Compute confusion matrix at optimal threshold
    preds_opt = (probs >= opt_threshold).astype(int)
    tp = np.sum((actuals == 1) & (preds_opt == 1))
    fp = np.sum((actuals == 0) & (preds_opt == 1))
    fn = np.sum((actuals == 1) & (preds_opt == 0))
    tn = np.sum((actuals == 0) & (preds_opt == 0))
    
    return {
        "precision": precision,
        "recall": recall,
        "ap": ap,
        "optimal_threshold": opt_threshold,
        "optimal_f1": opt_f1,
        "optimal_precision": opt_prec,
        "optimal_recall": opt_rec,
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "total": len(actuals),
        "positives": np.sum(actuals),
        "negatives": len(actuals) - np.sum(actuals)
    }

def format_results(res):
    if res is None:
        return {
            "total": "N/A",
            "ap": "N/A",
            "optimal_threshold": "N/A",
            "optimal_f1": "N/A",
            "optimal_precision": "N/A",
            "optimal_recall": "N/A",
            "tp": "0", "fp": "0", "fn": "0", "tn": "0",
            "tn_rate": "N/A", "tp_rate": "N/A",
            "prec_rate": "N/A", "npv_rate": "N/A",
            "positives": "0", "negatives": "0"
        }
    return {
        "total": f"{res['total']}",
        "ap": f"{res['ap']:.4f}",
        "optimal_threshold": f"{res['optimal_threshold']:.4f}",
        "optimal_f1": f"{res['optimal_f1']:.4f}",
        "optimal_precision": f"{res['optimal_precision']:.4f}",
        "optimal_recall": f"{res['optimal_recall']:.4f}",
        "tp": f"{res['tp']}",
        "fp": f"{res['fp']}",
        "fn": f"{res['fn']}",
        "tn": f"{res['tn']}",
        "tn_rate": f"{res['tn'] / res['negatives']:.2%}" if res['negatives'] > 0 else "0.00%",
        "tp_rate": f"{res['tp'] / res['positives']:.2%}" if res['positives'] > 0 else "0.00%",
        "prec_rate": f"{res['tp'] / (res['tp'] + res['fp']):.2%}" if (res['tp'] + res['fp']) > 0 else "0.00%",
        "npv_rate": f"{res['tn'] / (res['tn'] + res['fn']):.2%}" if (res['tn'] + res['fn']) > 0 else "0.00%",
        "positives": f"{res['positives']}",
        "negatives": f"{res['negatives']}"
    }

def main():
    print(f"Loading data from {DATA_PATH}...")
    if not DATA_PATH.exists():
        print(f"Error: {DATA_PATH} does not exist.")
        sys.exit(1)

    monthly_sales = load_sales_data(DATA_PATH)
    business_revenue_series = load_business_revenue_series(DATA_PATH)

    print("Classifying products and company revenue...")
    classification_rows = []

    for product_name, product_frame in monthly_sales.groupby(PRODUCT_COLUMN, sort=True):
        product_frame = product_frame.sort_values("period").reset_index(drop=True)
        quantities = product_frame[QUANTITY_COLUMN].astype(float).tolist()
        result = classify(quantities)
        classification_rows.append({
            "series_kind": "product",
            "product_name": product_name,
            "observations": len(product_frame),
            "total_quantity": float(product_frame[QUANTITY_COLUMN].sum()),
            "recommended_walk_forward_epochs": recommended_walk_forward_epochs(len(product_frame), min_train_size=MIN_TRAIN_SIZE, max_walk_forward_epochs=MAX_WALK_FORWARD_EPOCHS),
            "adi": result["adi"],
            "cv2": result["cv2"],
            "demand_type": result["demandType"],
            "algorithm": result["algorithm"],
        })

    if business_revenue_series is not None and not business_revenue_series.empty:
        revenue_values = business_revenue_series[QUANTITY_COLUMN].astype(float).tolist()
        revenue_result = classify(revenue_values)
        classification_rows.append({
            "series_kind": "business_revenue",
            "product_name": BUSINESS_REVENUE_NAME,
            "observations": len(business_revenue_series),
            "total_quantity": float(business_revenue_series[QUANTITY_COLUMN].sum()),
            "recommended_walk_forward_epochs": recommended_walk_forward_epochs(len(business_revenue_series), min_train_size=MIN_TRAIN_SIZE, max_walk_forward_epochs=MAX_WALK_FORWARD_EPOCHS),
            "adi": revenue_result["adi"],
            "cv2": revenue_result["cv2"],
            "demand_type": revenue_result["demandType"],
            "algorithm": revenue_result["algorithm"],
        })

    classification_df = pd.DataFrame(classification_rows)

    trainer_map = {
        "ARIMA_XGB": {
            "train_fn": lambda d, q, horizon=1: train_arima_xgb(d, q, horizon=horizon, arima_orders=ARIMA_ORDERS_INITIAL, xgb_params=ARIMA_XGB_PARAMS_INITIAL),
            "forecast_fn": forecast_arima_xgb,
        },
        "TSB_XGB": {
            "train_fn": lambda d, q, horizon=1: train_tsb_xgb(d, q, horizon=horizon, alpha_grid=ALPHA_GRID_INITIAL, beta_grid=BETA_GRID_INITIAL, xgb_params=TSB_XGB_PARAMS_INITIAL),
            "forecast_fn": forecast_tsb_xgb,
        },
    }

    print("Running sequential walk-forward epochs...")
    epoch_results = {}

    for _, row in classification_df.iterrows():
        product_name = row["product_name"]
        algorithm = row["algorithm"]
        series_kind = row["series_kind"]

        print(f"  Evaluating {product_name} using {algorithm}...")

        if series_kind == "business_revenue":
            product_history = business_revenue_series.sort_values("period").reset_index(drop=True).copy()
        else:
            product_history = monthly_sales[monthly_sales[PRODUCT_COLUMN] == product_name].sort_values("period").reset_index(drop=True).copy()

        dates = product_history["period_str"].tolist()
        quantities = product_history[QUANTITY_COLUMN].astype(float).tolist()
        walk_forward_epochs = row["recommended_walk_forward_epochs"]

        config = trainer_map[algorithm]
        selected_training_window, epoch_frame = select_best_training_window(
            dates=dates,
            quantities=quantities,
            train_fn=config["train_fn"],
            forecast_fn=config["forecast_fn"],
            demand_type=row["demand_type"],
            series_kind=series_kind,
            test_size=walk_forward_epochs,
        )

        epoch_frame = epoch_frame.copy()
        epoch_frame["product_name"] = product_name
        epoch_frame["algorithm"] = algorithm
        epoch_frame["demand_type"] = row["demand_type"]
        epoch_results[product_name] = epoch_frame

    # ── Advanced Metrics: R², MASE, Diebold-Mariano, Component Contribution ──
    print("Computing advanced metrics (R², MASE, Diebold-Mariano, Component Contribution)...")
    advanced_metrics = {}

    for _, adv_row in classification_df.iterrows():
        adv_product = adv_row["product_name"]
        adv_algorithm = adv_row["algorithm"]
        adv_series_kind = adv_row["series_kind"]
        adv_epoch_frame = epoch_results.get(adv_product)

        if adv_epoch_frame is None or adv_epoch_frame.empty:
            continue

        adv_actuals = adv_epoch_frame["actual"].values.astype(float)
        adv_hybrid = adv_epoch_frame["predicted"].values.astype(float)
        adv_standalone = adv_epoch_frame["standalone_predicted"].values.astype(float)
        adv_naive = adv_epoch_frame["naive_predicted"].values.astype(float)

        # Get training series for MASE denominator
        if adv_series_kind == "business_revenue":
            adv_history = business_revenue_series.sort_values("period").reset_index(drop=True)
        else:
            adv_history = monthly_sales[monthly_sales[PRODUCT_COLUMN] == adv_product].sort_values("period").reset_index(drop=True)
        adv_all_quantities = adv_history[QUANTITY_COLUMN].astype(float).tolist()
        adv_test_size = len(adv_epoch_frame)
        adv_training_series = adv_all_quantities[:len(adv_all_quantities) - adv_test_size]

        # Regression metrics including R²
        adv_regression = compute_metrics(adv_actuals, adv_hybrid)

        # MASE (Hyndman & Koehler, 2006)
        adv_hybrid_mase = compute_mase(adv_actuals, adv_hybrid, adv_training_series)
        adv_standalone_mase = compute_mase(adv_actuals, adv_standalone, adv_training_series)

        # Diebold-Mariano Tests
        adv_dm_vs_standalone = diebold_mariano_test(adv_actuals, adv_hybrid, adv_standalone)
        adv_dm_vs_naive = diebold_mariano_test(adv_actuals, adv_hybrid, adv_naive)

        # Component Contribution Analysis
        adv_contribution = compute_component_contribution(adv_actuals, adv_hybrid, adv_standalone)

        advanced_metrics[adv_product] = {
            "algorithm": adv_algorithm,
            "demand_type": adv_row["demand_type"],
            "series_kind": adv_series_kind,
            "r_squared": adv_regression.get("R²", np.nan),
            "hybrid_mase": adv_hybrid_mase,
            "standalone_mase": adv_standalone_mase,
            "dm_vs_standalone": adv_dm_vs_standalone,
            "dm_vs_naive": adv_dm_vs_naive,
            "contribution": adv_contribution,
        }

    print(f"  Computed advanced metrics for {len(advanced_metrics)} series.")

    # Process predictions across all products
    confusion_rows = []
    for _, row in classification_df.iterrows():
        product_name = row["product_name"]
        epoch_frame = epoch_results.get(product_name)
        if epoch_frame is None or epoch_frame.empty:
            continue
        frame = epoch_frame.copy()
        frame["actual_class"] = np.where(frame["actual"].astype(float) > 0, "Demand", "No Demand")
        frame["predicted_class"] = np.where(frame["predicted"].astype(float).round().clip(lower=0) > 0, "Demand", "No Demand")
        frame["predicted_demand_probability"] = 1 - np.exp(-frame["predicted"].astype(float).clip(lower=0))
        confusion_rows.append(frame[["product_name", "algorithm", "demand_type", "target_period", "actual", "predicted", "actual_class", "predicted_class", "predicted_demand_probability"]])

    confusion_epoch_df = pd.concat(confusion_rows, ignore_index=True)

    # Clean probabilities
    mlogloss_epsilon = 1e-2
    confusion_epoch_df["predicted_demand_probability"] = confusion_epoch_df["predicted_demand_probability"].astype(float).clip(mlogloss_epsilon, 1 - mlogloss_epsilon)

    # Compute subsets
    combined_res = evaluate_subset_pr(confusion_epoch_df)
    arima_res = evaluate_subset_pr(confusion_epoch_df[confusion_epoch_df["algorithm"] == "ARIMA_XGB"])
    tsb_res = evaluate_subset_pr(confusion_epoch_df[confusion_epoch_df["algorithm"] == "TSB_XGB"])

    combined_fmt = format_results(combined_res)
    arima_fmt = format_results(arima_res)
    tsb_fmt = format_results(tsb_res)

    # Create Matplotlib Multi-Curve Plot
    print("Generating Multi-Curve Precision-Recall Plot...")
    plt.figure(figsize=(10, 6), dpi=300)
    sns.set_theme(style="whitegrid")
    
    # 1. Combined curve
    if combined_res:
        plt.plot(combined_res["recall"], combined_res["precision"], color="#4F46E5", linewidth=3, 
                 label=f"Overall System (AP = {combined_res['ap']:.4f})")
        plt.scatter(combined_res["optimal_recall"], combined_res["optimal_precision"], color="#4F46E5", edgecolors="black", s=100, zorder=6,
                    label=f"Opt. Threshold Combined ({combined_res['optimal_threshold']:.4f})")

    # 2. ARIMA+XGB curve
    if arima_res:
        plt.plot(arima_res["recall"], arima_res["precision"], color="#10B981", linewidth=2.5, linestyle="--",
                 label=f"ARIMA + XGB (AP = {arima_res['ap']:.4f})")
        plt.scatter(arima_res["optimal_recall"], arima_res["optimal_precision"], color="#10B981", edgecolors="black", s=80, zorder=6,
                    label=f"Opt. Threshold ARIMA+XGB ({arima_res['optimal_threshold']:.4f})")

    # 3. TSB+XGB curve
    if tsb_res:
        plt.plot(tsb_res["recall"], tsb_res["precision"], color="#F59E0B", linewidth=2.5, linestyle=":",
                 label=f"TSB + XGB (AP = {tsb_res['ap']:.4f})")
        plt.scatter(tsb_res["optimal_recall"], tsb_res["optimal_precision"], color="#F59E0B", edgecolors="black", s=80, zorder=6,
                    label=f"Opt. Threshold TSB+XGB ({tsb_res['optimal_threshold']:.4f})")

    plt.xlabel("Recall", fontsize=12, fontweight="bold", labelpad=10)
    plt.ylabel("Precision", fontsize=12, fontweight="bold", labelpad=10)
    plt.title("Demand Classification Precision-Recall Curve Comparison", fontsize=14, fontweight="bold", pad=15)
    plt.xlim([-0.02, 1.02])
    plt.ylim([-0.02, 1.02])
    
    # No-skill baseline
    prevalence = np.mean((confusion_epoch_df["actual_class"] == "Demand").astype(int))
    plt.axhline(y=prevalence, color="#9CA3AF", linestyle="--", alpha=0.5, label=f"Baseline (Prev. = {prevalence:.2f})")
    
    plt.legend(loc="lower left", frameon=True, facecolor="white", edgecolor="#E5E7EB", fontsize=9)
    plt.tight_layout()
    
    plot_path = PROJECT_ROOT / "pr_curve.png"
    plt.savefig(plot_path, bbox_inches="tight")
    plt.close()
    print(f"Saved plot to {plot_path}")

    # Generate Markdown Report
    report_path = PROJECT_ROOT / "pr_curve_results.md"
    print(f"Generating markdown report at {report_path}...")
    
    md_content = f"""# Demand Classification Performance Report

This report evaluates the performance of the **Demand Classifier** across the walk-forward validation phase. We evaluate metrics for the **Overall System**, and break down the performance between **ARIMA+XGB** (routed for smooth/erratic demand) and **TSB+XGB** (routed for sparse, intermittent/lumpy demand).

---

## Executive Summary

| Model Subset | Total Support | Average Precision (AP) | Optimal Threshold | Optimal F1-Score | Precision (Opt) | Recall (Opt) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Overall System** | `{combined_fmt['total']}` | `{combined_fmt['ap']}` | `{combined_fmt['optimal_threshold']}` | `{combined_fmt['optimal_f1']}` | `{combined_fmt['optimal_precision']}` | `{combined_fmt['optimal_recall']}` |
| **ARIMA + XGB** | `{arima_fmt['total']}` | `{arima_fmt['ap']}` | `{arima_fmt['optimal_threshold']}` | `{arima_fmt['optimal_f1']}` | `{arima_fmt['optimal_precision']}` | `{arima_fmt['optimal_recall']}` |
| **TSB + XGB** | `{tsb_fmt['total']}` | `{tsb_fmt['ap']}` | `{tsb_fmt['optimal_threshold']}` | `{tsb_fmt['optimal_f1']}` | `{tsb_fmt['optimal_precision']}` | `{tsb_fmt['optimal_recall']}` |

*Note: If a subset displays **N/A**, it indicates that the subset did not contain a mixture of both 'Demand' and 'No Demand' periods during the 12 validation epochs, making a binary PR curve calculation mathematically undefined for that subset.*

---

## Precision-Recall Visualization

The multi-curve plot below highlights the different behavior of the two hybrid model variations. ARIMA+XGB operates on high-density active series, while TSB+XGB addresses highly sparse, zero-prone series.

![Precision-Recall Curve](pr_curve.png)

---

## Classification Matrices (Optimal Thresholds)

### 1. Overall System (Threshold: {combined_fmt['optimal_threshold']})
- **Support**: {combined_fmt['total']} validation epochs ({combined_fmt['positives']} Demand, {combined_fmt['negatives']} No Demand)

| Actual / Predicted | Predicted No Demand | Predicted Demand | Recall |
| :--- | :---: | :---: | :---: |
| **Actual No Demand** | `{combined_fmt['tn']}` | `{combined_fmt['fp']}` | `{combined_fmt['tn_rate']}` |
| **Actual Demand** | `{combined_fmt['fn']}` | `{combined_fmt['tp']}` | `{combined_fmt['tp_rate']}` |
| **Precision** | `{combined_fmt['npv_rate']}` | `{combined_fmt['prec_rate']}` | |

### 2. ARIMA + XGB Subset (Threshold: {arima_fmt['optimal_threshold']})
- **Support**: {arima_fmt['total']} validation epochs ({arima_fmt['positives']} Demand, {arima_fmt['negatives']} No Demand)

| Actual / Predicted | Predicted No Demand | Predicted Demand | Recall |
| :--- | :---: | :---: | :---: |
| **Actual No Demand** | `{arima_fmt['tn']}` | `{arima_fmt['fp']}` | `{arima_fmt['tn_rate']}` |
| **Actual Demand** | `{arima_fmt['fn']}` | `{arima_fmt['tp']}` | `{arima_fmt['tp_rate']}` |
| **Precision** | `{arima_fmt['npv_rate']}` | `{arima_fmt['prec_rate']}` | |

### 3. TSB + XGB Subset (Threshold: {tsb_fmt['optimal_threshold']})
- **Support**: {tsb_fmt['total']} validation epochs ({tsb_fmt['positives']} Demand, {tsb_fmt['negatives']} No Demand)

| Actual / Predicted | Predicted No Demand | Predicted Demand | Recall |
| :--- | :---: | :---: | :---: |
| **Actual No Demand** | `{tsb_res['tn'] if tsb_res else 0}` | `{tsb_res['fp'] if tsb_res else 0}` | `{tsb_fmt['tn_rate']}` |
| **Actual Demand** | `{tsb_res['fn'] if tsb_res else 0}` | `{tsb_res['tp'] if tsb_res else 0}` | `{tsb_fmt['tp_rate']}` |
| **Precision** | `{tsb_fmt['npv_rate']}` | `{tsb_fmt['prec_rate']}` | |

---

## Series Classification Breakdown

The table below lists each of the 11 time-series in the system, their computed ADI/CV² values, and their assigned model algorithm:

| Series Name | Series Kind | ADI | CV² | Demand Type | Selected Algorithm |
| :--- | :--- | :---: | :---: | :--- | :--- |
"""

    for _, row in classification_df.iterrows():
        md_content += f"| {row['product_name']} | {row['series_kind']} | {row['adi']:.2f} | {row['cv2']:.2f} | {row['demand_type']} | {row['algorithm']} |\n"

    # ── Walk-Forward Regression Metrics ─────────────────────────────────
    md_content += "\n---\n\n## Walk-Forward Regression Metrics\n\n"
    md_content += "| Series | Algorithm | R² | MASE | RMSE | MAE | MAPE | sMAPE | WAPE |\n"
    md_content += "| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n"
    for adv_name, adv_m in advanced_metrics.items():
        adv_ef = epoch_results[adv_name]
        adv_rm = compute_metrics(adv_ef["actual"].values, adv_ef["predicted"].values)
        md_content += f"| {adv_name} | {adv_m['algorithm']} | `{_sfmt(adv_m['r_squared'])}` | `{_sfmt(adv_m['hybrid_mase'])}` | `{_sfmt(adv_rm['RMSE'], 2)}` | `{_sfmt(adv_rm['MAE'], 2)}` | `{_sfmt(adv_rm['MAPE'], 2)}` | `{_sfmt(adv_rm['sMAPE'], 2)}` | `{_sfmt(adv_rm['WAPE'], 2)}` |\n"

    md_content += "\n*R² > 0 indicates the model explains variance better than the mean. MASE < 1 indicates the model outperforms the in-sample naïve forecast (Hyndman & Koehler, 2006).*\n"

    # ── Diebold-Mariano Statistical Significance Tests ──────────────────
    md_content += "\n---\n\n## Diebold-Mariano Statistical Significance Tests\n\n"

    md_content += "### Hybrid vs. Standalone (Base Model Only)\n\n"
    md_content += "*Tests whether the XGBoost residual correction significantly improves forecast accuracy over the base statistical model alone.*\n\n"
    md_content += "| Series | Algorithm | DM Statistic | p-value | Significant (p<0.05) | Better Model |\n"
    md_content += "| :--- | :--- | :---: | :---: | :---: | :--- |\n"
    for adv_name, adv_m in advanced_metrics.items():
        dm = adv_m["dm_vs_standalone"]
        sig_label = "✅ Yes" if dm["significant"] else "❌ No"
        if dm.get("better_model") == "Model 1":
            better_label = f"Hybrid ({adv_m['algorithm']})"
        elif dm.get("better_model") == "Model 2":
            base_name = "ARIMA" if "ARIMA" in adv_m["algorithm"] else "TSB"
            better_label = f"Standalone ({base_name})"
        else:
            better_label = dm.get("better_model", "N/A")
        md_content += f"| {adv_name} | {adv_m['algorithm']} | `{_sfmt(dm['dm_statistic'])}` | `{_sfmt(dm['p_value'])}` | {sig_label} | {better_label} |\n"

    md_content += "\n### Hybrid vs. Naïve Forecast (Last Observed Value)\n\n"
    md_content += "*Tests whether the hybrid model significantly outperforms a simple naïve baseline that predicts the last observed value.*\n\n"
    md_content += "| Series | Algorithm | DM Statistic | p-value | Significant (p<0.05) | Better Model |\n"
    md_content += "| :--- | :--- | :---: | :---: | :---: | :--- |\n"
    for adv_name, adv_m in advanced_metrics.items():
        dm = adv_m["dm_vs_naive"]
        sig_label = "✅ Yes" if dm["significant"] else "❌ No"
        if dm.get("better_model") == "Model 1":
            better_label = f"Hybrid ({adv_m['algorithm']})"
        elif dm.get("better_model") == "Model 2":
            better_label = "Naïve"
        else:
            better_label = dm.get("better_model", "N/A")
        md_content += f"| {adv_name} | {adv_m['algorithm']} | `{_sfmt(dm['dm_statistic'])}` | `{_sfmt(dm['p_value'])}` | {sig_label} | {better_label} |\n"

    # ── Component Contribution Analysis ─────────────────────────────────
    md_content += "\n---\n\n## Hybrid Component Contribution Analysis\n\n"
    md_content += "*Measures how much the XGBoost residual correction component improves the base statistical model (ARIMA or TSB).*\n\n"
    md_content += "| Series | Algorithm | Standalone MAE | Hybrid MAE | MAE Improvement % | Standalone RMSE | Hybrid RMSE | RMSE Improvement % | Residual Var. Reduction % |\n"
    md_content += "| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n"
    for adv_name, adv_m in advanced_metrics.items():
        c = adv_m["contribution"]
        md_content += f"| {adv_name} | {adv_m['algorithm']} | `{_sfmt(c['standalone_mae'], 2)}` | `{_sfmt(c['hybrid_mae'], 2)}` | `{_sfmt(c['mae_improvement_pct'], 1)}%` | `{_sfmt(c['standalone_rmse'], 2)}` | `{_sfmt(c['hybrid_rmse'], 2)}` | `{_sfmt(c['rmse_improvement_pct'], 1)}%` | `{_sfmt(c['residual_variance_reduction_pct'], 1)}%` |\n"

    md_content += "\n*Positive improvement % indicates XGB correction reduces forecast error. Negative values indicate the base model alone was more accurate.*\n"

    md_content += "\n---\n*Report generated automatically by the `generate_pr_curve.py` script.*\n"

    with open(report_path, "w", encoding="utf-8") as f:
        f.write(md_content)
    
    print(f"Successfully generated report at {report_path}")

if __name__ == "__main__":
    main()
