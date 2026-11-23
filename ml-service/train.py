"""Train the fraud model on synthetic transactions and save it with its metrics.

Run:  python train.py
"""
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

FEATURES = [
    "amount",
    "amount_ratio",        # amount / user's 30-day average
    "hour",                # 0-23
    "txns_last_hour",      # rapid repeated transactions
    "is_international",
    "is_new_device",
    "account_age_days",
]


def generate_data(n=30000, seed=42):
    rng = np.random.default_rng(seed)
    avg_amount = rng.lognormal(7.0, 0.6, n)                 # user's usual spend
    amount = avg_amount * rng.lognormal(0.0, 0.55, n)
    hour = rng.integers(0, 24, n)
    txns_last_hour = rng.poisson(0.5, n)
    is_international = (rng.random(n) < 0.08).astype(int)
    is_new_device = (rng.random(n) < 0.10).astype(int)
    account_age_days = rng.integers(1, 3000, n)
    ratio = amount / avg_amount

    # Hidden fraud process: unusual amount, bursts, odd hours, new device/account.
    risk = (
        1.0 * np.clip(ratio - 1, 0, 6)
        + 0.8 * np.clip(txns_last_hour, 0, 6)
        + 2.0 * is_international
        + 1.8 * is_new_device
        + 1.5 * (hour < 5)
        + 1.8 * (account_age_days < 30)
    )
    # Fraud = high combined risk plus some noise (so the data is not perfectly separable).
    is_fraud = ((risk + rng.normal(0, 0.4, n)) > 4.0).astype(int)

    return pd.DataFrame({
        "amount": amount.round(2),
        "amount_ratio": ratio.round(3),
        "hour": hour,
        "txns_last_hour": txns_last_hour,
        "is_international": is_international,
        "is_new_device": is_new_device,
        "account_age_days": account_age_days,
        "is_fraud": is_fraud,
    })


def train(model_path="model.joblib", metrics_path="metrics.json"):
    df = generate_data()
    X, y = df[FEATURES], df["is_fraud"]
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    model = RandomForestClassifier(
        n_estimators=250,
        min_samples_leaf=4,
        class_weight=None,
        n_jobs=-1,
        random_state=42,
    )
    model.fit(X_tr, y_tr)

    pred = model.predict(X_te)
    tn, fp, fn, tp = confusion_matrix(y_te, pred).ravel()
    metrics = {
        "precision": round(float(precision_score(y_te, pred)), 3),
        "recall": round(float(recall_score(y_te, pred)), 3),
        "f1": round(float(f1_score(y_te, pred)), 3),
        "fraud_rate": round(float(y.mean()), 4),
        "test_samples": int(len(y_te)),
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }
    joblib.dump(model, model_path)
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(json.dumps(metrics, indent=2))
    return model, metrics


if __name__ == "__main__":
    train()
