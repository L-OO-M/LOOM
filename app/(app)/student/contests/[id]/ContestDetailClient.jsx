"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";

const OPEN_STATUSES = new Set(["published", "active", "open"]);

export default function ContestDetailClient({ contest, registered, submissions }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const errorRef = useRef(null);
  const open = OPEN_STATUSES.has(contest.status);
  const deadline = contest.ends_at ? new Date(contest.ends_at) : null;
  const deadlinePassed = !!deadline && deadline <= new Date();
  const canRegister = !registered && open && !deadlinePassed;

  useEffect(() => {
    if (msg && errorRef.current) errorRef.current.focus();
  }, [msg]);

  async function register() {
    setBusy(true);
    setMsg("");
    let data;
    try {
      const res = await fetch("/api/contests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contestId: contest.id }) });
      data = await res.json();
    } catch {
      data = { ok: false };
    }
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Registration failed. Try again.");
      return;
    }
    router.refresh();
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    let data;
    try {
      const res = await fetch("/api/contests?action=submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contestId: contest.id, url: url || null, note: note || null }) });
      data = await res.json();
    } catch {
      data = { ok: false };
    }
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Submission failed. Try again.");
      return;
    }
    setUrl("");
    setNote("");
    router.refresh();
  }

  const input = { width: "100%", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14 };
  const label = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" };
  const ordered = [...submissions].reverse();

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        <p className="meta">Register → build → submit</p>
        {registered ? (
          <p className="mt-2 text-sm font-medium" style={{ color: "var(--accent)" }}>You&apos;re registered ✓</p>
        ) : canRegister ? (
          <div className="mt-3">
            <button onClick={register} disabled={busy} className="btn-ink disabled:opacity-50">
              {busy ? "Registering…" : "Register for this challenge"}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            {deadlinePassed ? "Entries have closed for this challenge." : "Registration is closed for this challenge."}
          </p>
        )}
        <p className="mt-3 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
          {deadline
            ? deadlinePassed
              ? `Entries closed ${deadline.toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`
              : `Entries close ${deadline.toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`
            : "No closing date announced yet."}
        </p>
        {msg && !registered && (
          <p ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive" className="mt-2 text-xs outline-none" style={{ color: "var(--danger)" }}>{msg}</p>
        )}
      </div>

      {registered && (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Submit your entry">
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Submit your entry</p>
          {deadlinePassed ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Entries have closed — your {submissions.length === 1 ? "entry" : "entries"} below are kept as your record.</p>
          ) : (
            <>
              <div>
                <label htmlFor="challenge-url" style={label}>Link to your work</label>
                <input id="challenge-url" value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="https://…" style={{ ...input, marginTop: 6 }} />
              </div>
              <div>
                <label htmlFor="challenge-note" style={label}>What did you build?</label>
                <textarea id="challenge-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="A sentence or two about your approach." style={{ ...input, marginTop: 6 }} />
              </div>
              <button disabled={busy} className="btn-ink disabled:opacity-50">
                {busy ? "Submitting…" : submissions.length > 0 ? "Submit another entry" : "Submit entry"}
              </button>
            </>
          )}
          {msg && (
            <p ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive" className="text-xs outline-none" style={{ color: "var(--danger)" }}>{msg}</p>
          )}
          {submissions.length > 0 && (
            <div className="pt-2">
              <p className="text-xs" style={{ color: "var(--text-muted)" }} role="status">
                Your {submissions.length === 1 ? "entry" : `entries (${submissions.length})`}
              </p>
              <Timeline className="mt-3">
                {ordered.map((s, i) => (
                  <TimelineItem
                    key={s.id}
                    state="done"
                    title={`Entry ${i + 1}`}
                    meta={s.created_at ? new Date(s.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                    body={s.note || "No note added."}
                    action={s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                        Open submitted link ↗
                      </a>
                    ) : null}
                  />
                ))}
              </Timeline>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
