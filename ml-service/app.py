"""Flask prediction API wrapping the Scikit-learn fraud model."""
import json
import os

import joblib
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

from train import FEATURES, train

MODEL_PATH, METRICS_PATH = "model.joblib", "metrics.json"
if not os.path.exists(MODEL_PATH):
    print("No trained model found - training one now...")
    train(MODEL_PATH, METRICS_PATH)

model = joblib.load(MODEL_PATH)
with open(METRICS_PATH) as f:
    metrics = json.load(f)

SUSPICIOUS_AT = 0.40   # score >= this  -> "suspicious"
FRAUD_AT = 0.75        # score >= this  -> "fraudulent"

app = Flask(__name__)
CORS(app)


def explain(t):
    """Plain-language reasons that match what the model learned."""
    reasons = []
    if t["amount_ratio"] >= 2.5:
        reasons.append(f"Amount is {t['amount_ratio']:.1f}x the user's usual spend")
    if t["txns_last_hour"] >= 3:
        reasons.append(f"{t['txns_last_hour']} transactions in the last hour")
    if t["is_international"]:
        reasons.append("International transaction")
    if t["is_new_device"]:
        reasons.append("Made from a new device")
    if t["hour"] < 5:
        reasons.append("Made late at night (12am-5am)")
    if t["account_age_days"] < 30:
        reasons.append("Account is less than 30 days old")
    return reasons


@app.get("/health")
def health():
    return jsonify(status="ok")


@app.get("/metrics")
def get_metrics():
    return jsonify(metrics)


@app.post("/predict")
def predict():
    data = request.get_json(silent=True) or {}
    try:
        avg = float(data["avg_amount_30d"])
        t = {
            "amount": float(data["amount"]),
            "hour": int(data["hour"]),
            "txns_last_hour": int(data["txns_last_hour"]),
            "is_international": int(bool(data["is_international"])),
            "is_new_device": int(bool(data["is_new_device"])),
            "account_age_days": int(data["account_age_days"]),
        }
        if avg <= 0 or t["amount"] <= 0:
            raise ValueError("amount and avg_amount_30d must be positive")
        t["amount_ratio"] = round(t["amount"] / avg, 3)
    except (KeyError, ValueError, TypeError) as e:
        return jsonify(error=f"Invalid input: {e}"), 400

    row = pd.DataFrame([[t[c] for c in FEATURES]], columns=FEATURES)
    score = float(model.predict_proba(row)[0][1])

    if score >= FRAUD_AT:
        label = "fraudulent"
    elif score >= SUSPICIOUS_AT:
        label = "suspicious"
    else:
        label = "legitimate"

    return jsonify(score=round(score, 3), label=label, reasons=explain(t))


if __name__ == "__main__":
    app.run(port=int(os.getenv("PORT", 8000)), debug=False)
