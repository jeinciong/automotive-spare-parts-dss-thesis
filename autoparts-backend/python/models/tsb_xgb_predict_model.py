"""
TSB + XGBoost artifact-based predictor.

Reads JSON from stdin:
{
  "model_path": "path/to/model.pkl",
  "horizon": 6
}
"""
import json
import sys

from tsb_xgb_model import forecast_from_artifact, load_trained_model

EXPECTED_ALGORITHM = "TSB_XGB"


def main():
    try:
        payload = json.loads(sys.stdin.read())
        artifact = load_trained_model(payload["model_path"])
        artifact_algorithm = artifact.get("algorithm") or artifact.get("meta", {}).get("algorithm")
        if artifact_algorithm != EXPECTED_ALGORITHM:
            raise ValueError(
                f"Model artifact algorithm mismatch: expected {EXPECTED_ALGORITHM}, got {artifact_algorithm or 'UNKNOWN'}"
            )
        current_last_period = payload.get("current_last_period")
        forecasts = forecast_from_artifact(artifact, int(payload.get("horizon", 6)), current_last_period=current_last_period)
        model_info = dict(artifact.get("meta", {}))
        model_info["saved_model_path"] = payload["model_path"]
        model_info["last_period"] = artifact.get("last_period")
        print(json.dumps({"success": True, "forecasts": forecasts, "model_info": model_info}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
