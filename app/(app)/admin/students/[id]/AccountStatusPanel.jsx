"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, CheckCircle2, RotateCcw, ShieldAlert } from "lucide-react";

const TONE = {
  active: { label: "Active", color: "var(--accent)" },
  suspended: { label: "Suspended", color: "var(--danger)" },
  deactivated: { label: "Deactivated", color: "var(--text-muted)" }
};

export function AccountStatusPanel({ userId, status = "active", reason = null, changedAt = null }) {
  const router = useRouter();
  const [target, setTarget] = useState(status === "active" ? "suspended" : "active");
  const [why, setWhy] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [outstanding, setOutstanding] = useState([]);

  const tone = TONE[status] || TONE.active;

  async function submit(next = target) {
    setError("");
    setMessage("");
    setOutstanding([]);
    if (next !== "active" && why.trim().length < 3) {
      setError("Give a short reason before changing this account.");
      return;
    }
    if (status !== "active" && next === "active" && !confirm) {
      setError("Tick the confirmation box before restoring access.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/students/${userId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next, reason: why.trim() || null, confirm: next === "active" ? confirm : undefined })
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) {
        if (data?.error?.code === "OFFBOARDING_OUTSTANDING") {
          setOutstanding(data.error.details?.outstanding || []);
        }
        setError(data?.error?.message || "Could not change this account's status.");
        return;
      }
      setMessage(next === "active" ? "Access restored." : next === "suspended" ? "Account suspended. Access stops on the next request." : "Account deactivated.");
      setConfirm(false);
      setWhy("");
      router.refresh();
    } catch {
      setError("Network error - nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]";

  return (
    <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
            <ShieldAlert size={14} /> Account status
          </h2>
          <p className="narrative mt-1">Suspending or closing an account keeps every record. Access is checked on every request.</p>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-xs font-medium" style={{ borderColor: "var(--line)", color: tone.color }}>
          {tone.label}
        </span>
      </div>

      {status !== "active" && reason && (
        <p className="mt-3 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
          {reason}{changedAt ? ` - ${new Date(changedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}` : ""}
        </p>
      )}

      {status === "active" ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <input type="radio" name="next-status" checked={target === "suspended"} onChange={() => setTarget("suspended")} /> Suspend
            </label>
            <label className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <input type="radio" name="next-status" checked={target === "deactivated"} onChange={() => setTarget("deactivated")} /> Close account
            </label>
          </div>
          <label className="block text-xs" style={{ color: "var(--text-muted)" }}>
            Reason
            <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} className={input} style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }} placeholder={target === "suspended" ? "Why is access paused?" : "Why is this account closing?"} />
          </label>
          <button onClick={() => submit()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50" style={{ background: "var(--danger)", color: "white" }}>
            {target === "suspended" ? <Ban size={14} /> : <AlertTriangle size={14} />}
            {busy ? "Saving..." : target === "suspended" ? "Suspend access" : "Close account"}
          </button>
          {target === "deactivated" && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>The account can only close once every offboarding item below is checked.</p>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-xs" style={{ color: "var(--text-muted)" }}>
            Reactivation note
            <input value={why} onChange={(e) => setWhy(e.target.value)} className={input} style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }} placeholder="Optional context for the audit log" />
          </label>
          <label className="flex items-start gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5" />
            I confirm this account should regain chapter access. Reactivation is audited and restores the previous role.
          </label>
          <button onClick={() => submit("active")} disabled={busy} className="btn-ink inline-flex items-center gap-1.5 disabled:opacity-50">
            {busy ? "Restoring..." : <><RotateCcw size={14} /> Reactivate</>}
          </button>
        </div>
      )}

      {outstanding.length > 0 && (
        <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "color-mix(in srgb, var(--danger) 24%, transparent)", background: "var(--wash)" }}>
          <p className="text-xs font-medium" style={{ color: "var(--danger)" }}>Still outstanding</p>
          <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--text)" }}>
            {outstanding.map((i) => <li key={i.key}>{i.label}</li>)}
          </ul>
        </div>
      )}
      {message && <p role="status" className="mt-3 inline-flex items-center gap-1 text-xs" style={{ color: "var(--accent)" }}><CheckCircle2 size={12} /> {message}</p>}
      {error && <p role="alert" className="mt-3 text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
    </section>
  );
}
