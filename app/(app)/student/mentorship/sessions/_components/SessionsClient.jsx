"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Star, Video, CalendarClock, XCircle } from "lucide-react";
import { OnboardingState, ErrorState } from "@/components/loom/States";
import { StatusPill } from "@/components/loom/primitives";

function fmtDT(iso) {
  if (!iso) return "Time to be agreed";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

const STATUS_TONE = { requested: "", scheduled: "live", completed: "solid", cancelled: "" };

export function SessionsClient() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [group, setGroup] = useState("upcoming");
  const [busyId, setBusyId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [resched, setResched] = useState({}); // id -> datetime-local value
  const [review, setReview] = useState({}); // id -> { rating, text }
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/my-sessions");
      const d = await res.json();
      if (!d.ok) throw new Error(d.error?.message || "Unable to load sessions");
      setData(d.data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(id, action, extra = {}) {
    setBusyId(id);
    setNotice("");
    try {
      const res = await fetch(`/api/my-sessions/${id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error?.message || "Action failed");
      setNotice(action === "cancel" ? "Session cancelled." : action === "reschedule" ? "Reschedule requested — the mentor confirms the new time." : "Review posted. Thanks!");
      await load();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <ErrorState title="Unable to load sessions" body={error} onRetry={load} />;
  if (!data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
        {[0, 1].map((i) => <div key={i} className="skel" style={{ height: 150 }} />)}
      </div>
    );
  }
  if (data.total === 0) {
    return (
      <OnboardingState
        eyebrow="My sessions"
        title="No sessions yet."
        why="Browse mentors, pick a time that suits you, and your upcoming and past sessions land here."
        action={<Link href="/student/mentorship" prefetch={false} className="btn-ink">Find a mentor</Link>}
      />
    );
  }

  const groups = [
    { id: "upcoming", label: `Upcoming · ${data.upcoming.length}` },
    { id: "past", label: `Past · ${data.past.length}` },
    { id: "cancelled", label: `Cancelled · ${data.cancelled.length}` },
  ];
  const list = data[group] || [];

  return (
    <div>
      <div className="flex gap-5 overflow-x-auto border-b" style={{ borderColor: "var(--line)" }} role="tablist" aria-label="Session groups">
        {groups.map((g) => (
          <button
            key={g.id} type="button" role="tab" aria-selected={group === g.id} onClick={() => setGroup(g.id)}
            className="shrink-0 pb-2.5 text-[13.5px] font-medium"
            style={{ color: group === g.id ? "var(--text)" : "var(--text-muted)", borderBottom: group === g.id ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1 }}
          >
            {g.label}
          </button>
        ))}
      </div>

      {notice && <p className="mt-3 text-[13px]" role="status" style={{ color: "var(--text)" }}>{notice}</p>}

      {list.length === 0 ? (
        <p className="mt-6 text-sm" style={{ color: "var(--text-muted)" }}>Nothing here in this group.</p>
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {list.map((s) => {
            const rv = review[s.id] || { rating: 5, text: "" };
            return (
              <li key={s.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-semibold" style={{ color: "var(--text)" }}>{s.mentor_name || "Mentor"}</p>
                    <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      {s.duration_minutes || 30} min{s.topic ? ` · ${s.topic}` : ""} · {fmtDT(s.scheduled_at)}
                    </p>
                  </div>
                  <StatusPill tone={STATUS_TONE[s.status] || ""}>{s.status}</StatusPill>
                </div>

                {expanded === s.id && (
                  <div className="mt-3 rounded-xl p-3 text-[12.5px] leading-5" style={{ background: "var(--bg-muted)", color: "var(--text-muted)" }}>
                    {s.message ? <p>“{s.message}”</p> : <p>No message attached.</p>}
                    {s.price != null && <p className="mt-1">Agreed price: ₹{Number(s.price).toLocaleString("en-IN")}</p>}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {group === "upcoming" && (
                    <>
                      {s.meeting_url ? (
                        <a href={s.meeting_url} target="_blank" rel="noreferrer" className="btn-ink !py-1.5 text-[12.5px]">
                          <Video size={13} /> Join Session
                        </a>
                      ) : (
                        <button type="button" disabled title="Meeting link will be available before the session" className="btn-ink !py-1.5 text-[12.5px] disabled:opacity-50">
                          <Video size={13} /> Join Session
                        </button>
                      )}
                      <button type="button" onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="btn-ghost !py-1.5 text-[12.5px]">
                        {expanded === s.id ? "Hide" : "Details"}
                      </button>
                      <button type="button" disabled={busyId === s.id} onClick={() => act(s.id, "cancel")} className="btn-ghost !py-1.5 text-[12.5px] disabled:opacity-50">
                        <XCircle size={13} /> Cancel
                      </button>
                    </>
                  )}
                  {group === "past" && (
                    <>
                      <button type="button" onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="btn-ghost !py-1.5 text-[12.5px]">
                        {expanded === s.id ? "Hide review" : "Leave Review"}
                      </button>
                      <Link href={`/student/mentorship/${s.mentor_id}`} prefetch={false} className="btn-ghost !py-1.5 text-[12.5px]">
                        Mentor profile
                      </Link>
                    </>
                  )}
                  {group === "cancelled" && (
                    <button type="button" onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="btn-ghost !py-1.5 text-[12.5px]">
                      View Details
                    </button>
                  )}
                </div>

                {!s.meeting_url && group === "upcoming" && (
                  <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                    Meeting link will be available before the session — your mentor attaches it on acceptance.
                  </p>
                )}

                {group === "upcoming" && (
                  <form
                    className="mt-2.5 flex flex-wrap items-center gap-2 border-t pt-2.5"
                    style={{ borderColor: "var(--line)" }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = resched[s.id];
                      if (!v) return;
                      act(s.id, "reschedule", { scheduledAt: new Date(v).toISOString() });
                    }}
                  >
                    <CalendarClock size={13} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                    <input
                      type="datetime-local"
                      aria-label="New date and time"
                      value={resched[s.id] || ""}
                      min={new Date().toISOString().slice(0, 16)}
                      onChange={(e) => setResched((r) => ({ ...r, [s.id]: e.target.value }))}
                      className="rounded-lg border px-2 py-1.5 text-[12.5px]"
                      style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)", colorScheme: "light dark" }}
                    />
                    <button type="submit" disabled={busyId === s.id || !resched[s.id]} className="text-[12.5px] font-semibold hover:underline disabled:opacity-50" style={{ color: "var(--accent)" }}>
                      Reschedule
                    </button>
                  </form>
                )}

                {group === "past" && expanded === s.id && (
                  <form
                    className="mt-2.5 border-t pt-2.5"
                    style={{ borderColor: "var(--line)" }}
                    onSubmit={(e) => { e.preventDefault(); act(s.id, "review", { rating: rv.rating, text: rv.text.trim() }); }}
                  >
                    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" role="radio" aria-checked={rv.rating === n} aria-label={`${n} stars`} onClick={() => setReview((r) => ({ ...r, [s.id]: { ...rv, rating: n } }))} className="p-0.5">
                          <Star size={17} fill={n <= rv.rating ? "var(--accent)" : "none"} strokeWidth={1.5} style={{ color: "var(--accent)" }} />
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={rv.text} onChange={(e) => setReview((r) => ({ ...r, [s.id]: { ...rv, text: e.target.value } }))}
                      rows={2} maxLength={1000} placeholder="What did this mentor help you with?"
                      aria-label="Review text"
                      className="mt-2 w-full rounded-xl border px-3 py-2 text-[13px]"
                      style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
                    />
                    <button type="submit" disabled={busyId === s.id} className="btn-ink mt-2 !py-1.5 text-[12.5px] disabled:opacity-50">
                      {busyId === s.id ? "Posting…" : "Post review"}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
