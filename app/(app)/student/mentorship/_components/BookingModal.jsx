"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import {
  SESSION_TYPES, priceFor, inr, slotsForDate, nextBookableDates, validateBooking, toScheduledAt,
} from "@/lib/mentors";

// Booking flow: session type -> date -> time slot -> message ->
// summary -> confirm. Slots come from the mentor's real weekly schedule
// minus already-booked times; without a schedule we say so honestly.
export function BookingModal({ mentor, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(mentor.session_minutes || 60);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(`/api/mentors/${mentor.user_id}`).then((r) => r.json()).then((d) => {
      if (!live) return;
      if (d?.ok) setDetail(d.data);
      setLoading(false);
    }).catch(() => live && setLoading(false));
    return () => { live = false; };
  }, [mentor.user_id]);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const schedule = detail?.availability || [];
  const dates = nextBookableDates(schedule);
  const dayRows = schedule.filter((s) => date && Number(s.day_of_week) === new Date(`${date}T00:00:00`).getDay());
  const slots = slotsForDate(dayRows, (detail?.booked || {})[date] || [], duration);
  const price = priceFor(mentor.hourly_rate, duration);

  async function confirm() {
    setError("");
    const check = validateBooking({ mentor: detail?.mentor || mentor, dateIso: date, time, duration, bookedTimes: (detail?.booked || {})[date] || [] });
    if (!check.ok) { setError(check.error); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/mentors/${mentor.user_id}/book`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ duration, date, time, topic: topic.trim(), message: message.trim() }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error?.message || "Booking failed");
      setDone({ ...d.data.session, scheduledAt: toScheduledAt(date, time) });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = { width: "100%", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14 };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Book a session with ${mentor.mentor_name}`}>
      <div className="overlay" onClick={onClose} aria-hidden="true" />
      <div
        className="relative flex max-h-[92dvh] w-full flex-col overflow-y-auto rounded-t-2xl border p-5 sm:max-w-lg sm:rounded-2xl sm:p-6"
        style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="meta">Book a session</p>
            <h2 className="h-product mt-1">{mentor.mentor_name || "Mentor"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close booking" className="rounded-lg p-1.5 hover:bg-[var(--bg-muted)]" style={{ color: "var(--text-muted)" }}>
            <X size={17} />
          </button>
        </div>

        {done ? (
          <div className="py-4 text-center">
            <CheckCircle2 size={40} className="mx-auto" style={{ color: "#16a34a" }} aria-hidden="true" />
            <h3 className="h-product mt-3">Session booked successfully</h3>
            <dl className="mx-auto mt-4 max-w-xs space-y-1.5 text-left text-sm">
              {[["Mentor", mentor.mentor_name], ["Session", `${duration} minutes`],
                ["Date", new Date(done.scheduledAt).toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })],
                ["Time", new Date(done.scheduledAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })],
                price != null && ["Price", inr(price)],
              ].filter(Boolean).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
                  <dd className="font-semibold" style={{ color: "var(--text)" }}>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="narrative mx-auto mt-3 text-center">The mentor will accept your request shortly. Meeting details appear on acceptance.</p>
            <div className="mt-5 flex justify-center gap-2">
              <Link href="/student/mentorship/sessions" prefetch={false} className="btn-ink">View My Sessions</Link>
              <button type="button" onClick={onClose} className="btn-ghost">Done</button>
            </div>
          </div>
        ) : loading ? (
          <div className="py-6" aria-hidden="true">
            <div className="skel" style={{ height: 40 }} />
            <div className="skel mt-3" style={{ height: 90 }} />
            <div className="skel mt-3" style={{ height: 40 }} />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <fieldset>
              <legend className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Session length</legend>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {SESSION_TYPES.map((s) => (
                  <button
                    key={s.minutes}
                    type="button"
                    aria-pressed={duration === s.minutes}
                    onClick={() => { setDuration(s.minutes); setTime(""); }}
                    className="rounded-xl border px-3 py-2.5 text-sm font-semibold transition"
                    style={duration === s.minutes
                      ? { borderColor: "var(--dash-accent, var(--accent))", background: "var(--dash-accent-soft, var(--wash))", color: "var(--text)" }
                      : { borderColor: "var(--line)", color: "var(--text-muted)" }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {dates.length === 0 ? (
              <div className="rounded-xl border p-4 text-sm leading-6" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text-muted)" }}>
                This mentor hasn&apos;t set weekly availability yet — no slots to pick.
                You can still send a plain session request and agree a time over messages.
                <form
                  className="mt-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setError(""); setBusy(true);
                    try {
                      const res = await fetch("/api/mentorship", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mentorId: mentor.user_id }) });
                      const d = await res.json();
                      if (!d.ok) throw new Error(d.error?.message || "Request failed");
                      setDone({ scheduledAt: new Date().toISOString(), open: true });
                    } catch (err) { setError(err.message); } finally { setBusy(false); }
                  }}
                >
                  <button className="btn-ink" disabled={busy}>{busy ? "Sending…" : "Send open request"}</button>
                </form>
              </div>
            ) : (
              <>
                <fieldset>
                  <legend className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Date</legend>
                  <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
                    {dates.map((d) => (
                      <button
                        key={d.iso}
                        type="button"
                        aria-pressed={date === d.iso}
                        onClick={() => { setDate(d.iso); setTime(""); }}
                        className="shrink-0 rounded-xl border px-3 py-2 text-center transition"
                        style={date === d.iso
                          ? { borderColor: "var(--dash-accent, var(--accent))", background: "var(--dash-accent-soft, var(--wash))", color: "var(--text)" }
                          : { borderColor: "var(--line)", color: "var(--text-muted)" }}
                      >
                        <span className="block text-[10px] font-semibold uppercase">{d.weekday}</span>
                        <span className="block text-sm font-bold">{d.label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                {date && (
                  <fieldset>
                    <legend className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Time</legend>
                    {slots.length === 0 ? (
                      <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>No slots that day — try another date.</p>
                    ) : (
                      <div className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {slots.map((s) => (
                          <button
                            key={s.time}
                            type="button"
                            disabled={!s.available}
                            aria-pressed={time === s.time}
                            onClick={() => setTime(s.time)}
                            className="rounded-lg border px-2 py-2 text-[12.5px] font-semibold tabular-nums transition disabled:opacity-35"
                            style={time === s.time
                              ? { borderColor: "var(--dash-accent, var(--accent))", background: "var(--dash-accent-soft, var(--wash))", color: "var(--text)" }
                              : { borderColor: "var(--line)", color: "var(--text)" }}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </fieldset>
                )}
              </>
            )}

            <label className="block">
              <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>What would you like help with? (optional)</span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={1000} placeholder="e.g. System design for my placement interview" style={{ ...inputStyle, marginTop: 6 }} />
            </label>

            {date && time && (
              <div className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
                <p style={{ color: "var(--text)" }}>
                  <strong>{duration} min</strong> · {new Date(toScheduledAt(date, time)).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} ·{" "}
                  {new Date(toScheduledAt(date, time)).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                  {price != null && <> · <strong>{inr(price)}</strong></>}
                </p>
              </div>
            )}

            {error && <p className="text-sm" role="alert" style={{ color: "var(--danger)" }}>{error}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={confirm} disabled={busy || (!date && dates.length > 0)} className="btn-ink flex-1 justify-center disabled:opacity-50">
                {busy ? "Booking…" : "Confirm Booking"}
              </button>
              <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
