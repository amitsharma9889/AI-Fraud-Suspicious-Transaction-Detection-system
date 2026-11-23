import { useEffect, useState } from "react";

// Backend URL. Set VITE_API_URL on Vercel (no trailing slash). Empty = use the local Vite proxy.
const API = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const EMPTY = {
  amount: "",
  avg_amount_30d: "",
  hour: new Date().getHours(),
  txns_last_hour: 0,
  account_age_days: 365,
  is_international: false,
  is_new_device: false,
};

// Quick-fill examples so the demo works in one click.
const SAMPLES = [
  { name: "Everyday purchase", data: { amount: 850, avg_amount_30d: 1000, hour: 14, txns_last_hour: 0, account_age_days: 900, is_international: false, is_new_device: false } },
  { name: "Odd-hour, new device", data: { amount: 4500, avg_amount_30d: 1000, hour: 2, txns_last_hour: 1, account_age_days: 400, is_international: false, is_new_device: true } },
  { name: "Card-testing burst", data: { amount: 15000, avg_amount_30d: 1000, hour: 3, txns_last_hour: 5, account_age_days: 10, is_international: true, is_new_device: true } },
];

const VERDICT = {
  legitimate: { title: "Looks legitimate", note: "No unusual patterns found. Safe to approve." },
  suspicious: { title: "Needs review", note: "Some signals look unusual. Check with the customer before approving." },
  fraudulent: { title: "Likely fraud", note: "Strong fraud signals. Hold this transaction and contact the customer." },
};

const money = (n) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

// Read a response as JSON, with a clear error if the server sent something else (e.g. an HTML 404 page).
async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The server did not return JSON. Check that VITE_API_URL points to your Express API.");
  }
}

function RiskMeter({ score }) {
  const pct = Math.round(score * 100);
  return (
    <div className="meter" role="img" aria-label={`Risk score ${pct} out of 100`}>
      <div className="meter-track">
        <span className="zone z-ok" />
        <span className="zone z-warn" />
        <span className="zone z-bad" />
        <span className="marker" style={{ left: `${pct}%` }} />
      </div>
      <div className="meter-scale">
        <span>Low</span>
        <span>Review</span>
        <span>Fraud</span>
      </div>
    </div>
  );
}

export default function App() {
  const [form, setForm] = useState(EMPTY);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [model, setModel] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      const [h, s] = await Promise.all([
        fetch(`${API}/api/transactions`).then(readJson),
        fetch(`${API}/api/stats`).then(readJson),
      ]);
      if (Array.isArray(h)) setHistory(h);
      if (s && typeof s.total === "number") setStats(s);
    } catch {
      /* server offline - shown on submit */
    }
  };

  useEffect(() => {
    refresh();
    fetch(`${API}/api/model`)
      .then((r) => r.ok && readJson(r))
      .then((m) => m && setModel(m))
      .catch(() => {});
  }, []);

  const set = (k) => (e) =>
    setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Number inputs give strings, so convert before sending.
      const body = {
        amount: Number(form.amount),
        avg_amount_30d: Number(form.avg_amount_30d),
        hour: Number(form.hour),
        txns_last_hour: Number(form.txns_last_hour),
        account_age_days: Number(form.account_age_days),
        is_international: Boolean(form.is_international),
        is_new_device: Boolean(form.is_new_device),
      };
      const res = await fetch(`${API}/api/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setResult(data);
      refresh();
    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "Can't reach the server. If it is on Render's free plan, wait a minute for it to wake up and try again."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <header className="top">
        <h1>Transaction risk check</h1>
        <p>Enter a transaction and see right away whether it looks normal, needs review, or is likely fraud.</p>
      </header>

      <main className="grid">
        <section className="panel">
          <h2>Transaction details</h2>
          <div className="samples">
            <span>Try an example:</span>
            {SAMPLES.map((s) => (
              <button key={s.name} type="button" className="chip" onClick={() => setForm(s.data)}>
                {s.name}
              </button>
            ))}
          </div>

          <form onSubmit={submit}>
            <div className="row">
              <label>
                Amount (₹)
                <input type="number" min="0.01" step="0.01" required value={form.amount} onChange={set("amount")} />
              </label>
              <label>
                Usual spend, last 30 days (₹)
                <input type="number" min="0.01" step="0.01" required value={form.avg_amount_30d} onChange={set("avg_amount_30d")} />
              </label>
            </div>
            <div className="row">
              <label>
                Hour of day (0–23)
                <input type="number" min="0" max="23" required value={form.hour} onChange={set("hour")} />
              </label>
              <label>
                Transactions in the last hour
                <input type="number" min="0" required value={form.txns_last_hour} onChange={set("txns_last_hour")} />
              </label>
              <label>
                Account age (days)
                <input type="number" min="0" required value={form.account_age_days} onChange={set("account_age_days")} />
              </label>
            </div>
            <div className="checks">
              <label className="check">
                <input type="checkbox" checked={form.is_international} onChange={set("is_international")} />
                International transaction
              </label>
              <label className="check">
                <input type="checkbox" checked={form.is_new_device} onChange={set("is_new_device")} />
                New device
              </label>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" disabled={loading}>{loading ? "Checking…" : "Check transaction"}</button>
          </form>
        </section>

        <section className="panel result" aria-live="polite">
          <h2>Result</h2>
          {!result ? (
            <p className="empty">Check a transaction to see its risk score and the reasons behind it.</p>
          ) : (
            <div className={`verdict v-${result.label}`}>
              <div className="score">
                <strong>{Math.round(result.score * 100)}</strong>
                <span>/ 100 risk</span>
              </div>
              <h3>{VERDICT[result.label].title}</h3>
              <p>{VERDICT[result.label].note}</p>
              <RiskMeter score={result.score} />
              {result.reasons.length > 0 && (
                <>
                  <h4>Why it was flagged</h4>
                  <ul>{result.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </>
              )}
            </div>
          )}

          {model && (
            <p className="model-note">
              Model accuracy on test data: precision {model.precision}, recall {model.recall}.
            </p>
          )}
        </section>

        <section className="panel wide">
          <div className="history-head">
            <h2>Recent checks</h2>
            {stats && (
              <p className="stats">
                {stats.total} checked · {stats.legitimate} legitimate · {stats.suspicious} to review · {stats.fraudulent} likely fraud
              </p>
            )}
          </div>
          {history.length === 0 ? (
            <p className="empty">No transactions checked yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Time</th><th>Amount</th><th>Hour</th><th>Last hour</th><th>Flags</th><th>Risk</th><th>Verdict</th></tr>
                </thead>
                <tbody>
                  {history.map((t) => (
                    <tr key={t.id}>
                      <td>{new Date(t.createdAt).toLocaleTimeString()}</td>
                      <td>{money(t.amount)}</td>
                      <td>{t.hour}:00</td>
                      <td>{t.txns_last_hour}</td>
                      <td>{[t.is_international && "International", t.is_new_device && "New device"].filter(Boolean).join(", ") || "None"}</td>
                      <td>{Math.round(t.score * 100)}</td>
                      <td><span className={`tag v-${t.label}`}>{VERDICT[t.label].title}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
