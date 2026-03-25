"""
ADI / CV² Demand Classification
Classifies demand pattern and routes to ARIMA_XGB or TSB_XGB.
ADI >= 1.32 or CV² >= 0.49 -> TSB_XGB (intermittent/lumpy)
Otherwise -> ARIMA_XGB (smooth/erratic)
"""
import sys, json, math

ADI_THRESH = 1.32
CV2_THRESH = 0.49

def classify(quantities):
    arr = [float(q) for q in quantities]
    n = len(arr)
    nz = [q for q in arr if q > 0]
    if not nz:
        return {"adi": float("inf"), "cv2": 0.0, "demandType": "INTERMITTENT", "algorithm": "TSB_XGB"}
    adi = n / len(nz)
    mean_nz = sum(nz) / len(nz)
    std_nz = math.sqrt(sum((q - mean_nz)**2 for q in nz) / max(len(nz)-1, 1))
    cv2 = (std_nz / mean_nz)**2 if mean_nz > 0 else 0.0
    high_adi = adi >= ADI_THRESH
    high_cv2 = cv2 >= CV2_THRESH
    if not high_adi and not high_cv2:
        dt, algo = "SMOOTH", "ARIMA_XGB"
    elif not high_adi and high_cv2:
        dt, algo = "ERRATIC", "ARIMA_XGB"
    elif high_adi and not high_cv2:
        dt, algo = "INTERMITTENT", "TSB_XGB"
    else:
        dt, algo = "LUMPY", "TSB_XGB"
    return {"adi": round(adi, 4), "cv2": round(cv2, 4), "demandType": dt, "algorithm": algo}

def main():
    try:
        payload = json.loads(sys.stdin.read())
        result = classify(payload["quantities"])
        print(json.dumps({"success": True, **result}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
