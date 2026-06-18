"""
Standalone ARIMA + XGBoost trainer.

Reads JSON from stdin:
{
  "dates": ["2024-01", "2024-02", ...],
  "quantities": [120, 98, ...],
  "horizon": 6,
  "product_name": "Brake Pad",
  "output_path": "optional/custom/path.pkl"
}

Writes JSON to stdout with the saved model path and preview forecasts.
"""
import json
import sys

from arima_xgb_model import train_and_save_model


def main():
    try:
        payload = json.loads(sys.stdin.read())
        result = train_and_save_model(
            payload["dates"],
            payload["quantities"],
            int(payload.get("horizon", 6)),
            payload.get("product_name"),
            payload.get("output_path"),
        )
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
