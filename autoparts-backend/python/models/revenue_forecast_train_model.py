"""
Dedicated business sales revenue trainer.

Reads JSON from stdin:
{
  "dates": ["2024-01", "2024-02", ...],
  "revenues": [12000, 14500, ...],
  "horizon": 6,
  "series_name": "monthly_total_revenue",
  "display_name": "Business Sales Revenue",
  "output_path": "optional/custom/path.pkl"
}

This script classifies the revenue series and delegates training to the
matching ARIMA+XGB or TSB+XGB pipeline, then persists revenue-specific
metadata back into the saved artifact.
"""
import json
import pickle
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
PYTHON_ROOT = CURRENT_DIR.parent
if str(PYTHON_ROOT) not in sys.path:
    sys.path.append(str(PYTHON_ROOT))

from arima_xgb_model import train_and_save_model as train_arima_xgb
from tsb_xgb_model import train_and_save_model as train_tsb_xgb
from utils.demand_classifier import classify

SERIES_KIND = "BUSINESS_SALES_REVENUE"
DEFAULT_SERIES_NAME = "monthly_total_revenue"
DEFAULT_DISPLAY_NAME = "Business Sales Revenue"


def _load_artifact(model_path):
    with Path(model_path).open("rb") as handle:
        return pickle.load(handle)


def _save_artifact(model_path, artifact):
    output_path = Path(model_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as handle:
        pickle.dump(artifact, handle)


def main():
    try:
        payload = json.loads(sys.stdin.read())
        dates = payload["dates"]
        revenues = payload.get("revenues", payload.get("quantities"))
        horizon = int(payload.get("horizon", 6))
        series_name = payload.get("series_name") or DEFAULT_SERIES_NAME
        display_name = payload.get("display_name") or DEFAULT_DISPLAY_NAME
        output_path = payload.get("output_path")

        if revenues is None:
            raise ValueError("revenues is required")

        class_result = classify(revenues)
        algorithm = class_result["algorithm"]
        trainer = train_arima_xgb if algorithm == "ARIMA_XGB" else train_tsb_xgb
        result = trainer(dates, revenues, horizon, series_name, output_path)

        if not result.get("success"):
            print(json.dumps(result))
            return

        saved_model_path = result["saved_model_path"]
        artifact = _load_artifact(saved_model_path)
        artifact["series_kind"] = SERIES_KIND
        artifact["series_name"] = display_name
        artifact["pipeline_algorithm"] = algorithm

        meta = dict(artifact.get("meta", {}))
        meta.update({
            "algorithm": algorithm,
            "pipeline_algorithm": algorithm,
            "series_kind": SERIES_KIND,
            "series_name": display_name,
            "demand_type": class_result["demandType"],
            "adi": class_result["adi"],
            "cv2": class_result["cv2"],
        })
        artifact["meta"] = meta
        _save_artifact(saved_model_path, artifact)

        result["algorithm"] = algorithm
        result["series_kind"] = SERIES_KIND
        result["series_name"] = display_name
        result["model_info"] = {
            **dict(result.get("model_info", {})),
            **meta,
            "saved_model_path": saved_model_path,
        }
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
