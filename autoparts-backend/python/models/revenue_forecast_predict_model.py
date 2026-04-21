"""
Dedicated business sales revenue predictor.

Reads JSON from stdin:
{
  "model_path": "path/to/revenue-model.pkl",
  "horizon": 6
}
"""
import json
import pickle
import sys
from pathlib import Path

from arima_xgb_model import forecast_from_artifact as forecast_arima_xgb
from tsb_xgb_model import forecast_from_artifact as forecast_tsb_xgb


def _load_artifact(model_path):
    with Path(model_path).open("rb") as handle:
        return pickle.load(handle)


def main():
    try:
        payload = json.loads(sys.stdin.read())
        artifact = _load_artifact(payload["model_path"])
        algorithm = artifact.get("algorithm") or artifact.get("meta", {}).get("algorithm")

        if algorithm == "ARIMA_XGB":
            forecasts = forecast_arima_xgb(artifact, int(payload.get("horizon", 6)))
        elif algorithm == "TSB_XGB":
            forecasts = forecast_tsb_xgb(artifact, int(payload.get("horizon", 6)))
        else:
            raise ValueError(f"Unsupported revenue artifact algorithm: {algorithm or 'UNKNOWN'}")

        model_info = dict(artifact.get("meta", {}))
        model_info["saved_model_path"] = payload["model_path"]
        print(json.dumps({
            "success": True,
            "algorithm": algorithm,
            "series_kind": artifact.get("series_kind", "BUSINESS_SALES_REVENUE"),
            "series_name": artifact.get("series_name", "Business Sales Revenue"),
            "forecasts": forecasts,
            "model_info": model_info,
        }))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
