"""
ARIMA + XGBoost artifact-based predictor.

Reads JSON from stdin:
{
  "model_path": "path/to/model.pkl",
  "horizon": 6
}
"""
import json
import sys

from arima_xgb_model import forecast_from_artifact, load_trained_model

EXPECTED_ALGORITHM = "ARIMA_XGB"


def main():
    try:
        payload = json.loads(sys.stdin.read())
        artifact = load_trained_model(payload["model_path"])
        artifact_algorithm = artifact.get("algorithm") or artifact.get("meta", {}).get("algorithm")
        if artifact_algorithm != EXPECTED_ALGORITHM:
            raise ValueError(
                f"Model artifact algorithm mismatch: expected {EXPECTED_ALGORITHM}, got {artifact_algorithm or 'UNKNOWN'}"
            )
        forecasts = forecast_from_artifact(artifact, int(payload.get("horizon", 6)))
        model_info = dict(artifact.get("meta", {}))
        model_info["saved_model_path"] = payload["model_path"]
        print(json.dumps({"success": True, "forecasts": forecasts, "model_info": model_info}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
