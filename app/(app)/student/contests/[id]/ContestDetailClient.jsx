"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ContestDetailClient({ contest, registered, submissions }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const open = ["published", "active", "open"].includes(contest.status);

  async function register() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/contests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contestId: contest.id }) });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    router.refresh();
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/contests?action=submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contestId: contest.id, url: url || null, note: note || null }) });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setUrl("");
    setNote("");
    router.refresh();
  }

  const input = { width: "100%", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14 };
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        {registered ? (
          <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>Registered ✓</p>
        ) : open ? (
          <button onClick={register} disabled={busy} className="btn-ink disabled:opacity-50">
            {busy ? "Registering…" : "Register"}
          </button>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Registration closed ({contest.status}).</p>
        )}
        {msg && <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      </div>
      {registered && (
        <form onSubmit={submit} className="space-y-3 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Submit entry</p>
          <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="https://…" style={input} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="What did you build?" style={input} />
          <button disabled={busy} className="btn-ink disabled:opacity-50">
            {busy ? "Submitting…" : "Submit"}
          </button>
          {submissions.length > 0 && (
            <div className="pt-2">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Your submissions ({submissions.length})</p>
              {submissions.map((s) => (
                <p key={s.id} className="mt-1 truncate text-xs" style={{ color: "var(--text-muted)" }}>{s.url || "(no url)"} · {new Date(s.created_at).toLocaleString("en-IN")}</p>
              ))}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
