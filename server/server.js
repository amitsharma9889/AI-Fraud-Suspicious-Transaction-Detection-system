require("dotenv").config();
const express = require("express");
const cors = require("cors");

const PORT = process.env.PORT || 5000;
const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

const app = express();
app.use(cors());
app.use(express.json());

// In-memory store (resets on restart). Swap for MongoDB if you want persistence.
const transactions = [];

function validate(b) {
  const errors = [];
  const num = (k, min, max) => {
    const v = Number(b[k]);
    if (b[k] === undefined || b[k] === "" || Number.isNaN(v)) errors.push(`${k} is required`);
    else if (v < min || v > max) errors.push(`${k} must be between ${min} and ${max}`);
  };
  num("amount", 0.01, 1e9);
  num("avg_amount_30d", 0.01, 1e9);
  num("hour", 0, 23);
  num("txns_last_hour", 0, 100);
  num("account_age_days", 0, 36500);
  return errors;
}

app.get("/api/health", async (_req, res) => {
  try {
    const r = await fetch(`${ML_URL}/health`);
    res.json({ server: "ok", ml: r.ok ? "ok" : "down" });
  } catch {
    res.json({ server: "ok", ml: "down" });
  }
});

app.get("/api/model", async (_req, res) => {
  try {
    const r = await fetch(`${ML_URL}/metrics`);
    res.json(await r.json());
  } catch {
    res.status(502).json({ error: "ML service is not reachable" });
  }
});

app.post("/api/transactions", async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(", ") });

  const input = {
    amount: Number(req.body.amount),
    avg_amount_30d: Number(req.body.avg_amount_30d),
    hour: Number(req.body.hour),
    txns_last_hour: Number(req.body.txns_last_hour),
    is_international: Boolean(req.body.is_international),
    is_new_device: Boolean(req.body.is_new_device),
    account_age_days: Number(req.body.account_age_days),
  };

  try {
    const r = await fetch(`${ML_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await r.json();
    if (!r.ok) return res.status(r.status).json(result);

    const record = {
      id: transactions.length + 1,
      createdAt: new Date().toISOString(),
      ...input,
      ...result,
    };
    transactions.unshift(record);
    res.status(201).json(record);
  } catch {
    res.status(502).json({ error: "ML service is not reachable. Start it on " + ML_URL });
  }
});

app.get("/api/transactions", (_req, res) => res.json(transactions.slice(0, 50)));

app.get("/api/stats", (_req, res) => {
  const count = (l) => transactions.filter((t) => t.label === l).length;
  res.json({
    total: transactions.length,
    legitimate: count("legitimate"),
    suspicious: count("suspicious"),
    fraudulent: count("fraudulent"),
  });
});

app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
