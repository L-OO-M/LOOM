"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Video } from "lucide-react";
import { OnboardingState, ErrorState } from "@/components/loom/States";
import { MessageThread } from "../../_components/MessageThread";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ManageClient() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [slots, setSlots] = useState([]);
  const [profile, setProfile] = useState({});
  const [meeting, setMeeting] = useState({});
  const [replyTo, setReplyTo] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/mentor/overview");
      const d = await res.json();
      if (!d.ok) throw new Error(d.error?.message || "Unable to load dashboard");
      setData(d.data);
      setSlots(d.data.availability || []);
      setProfile(d.data.mentor || {});
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(id, decision) {
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch(`/api/mentor/requests/${id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, ...(decision === "accept" && meeting[id] ? { meetingUrl: meeting[id] } : {}) }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error?.message || "Action failed");
      setNotice(decision === "accept" ? "Request accepted — the student has been notified." : "Request declined.");
      await load();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAvailability() {
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/mentor/availability", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ slots: slots.map((s) => ({ day: s.day ?? s.day_of_week, start: s.start ?? s.start_time, end: s.end ?? s.end_time })) }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error?.message || "Couldn't save availability");
      setSlots(d.data.availability.map((a) => ({ day: a.day_of_week, start: a.start_time, end: a.end_time })));
      setNotice("Availability saved — students see the new slots immediately.");
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/mentor/profile", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          headline: profile.headline, bio: profile.bio, skills: profile.skills,
          expertise: profile.expertise, languages: profile.languages, timezone: profile.timezone,
          experience_years: profile.experience_years === "" || profile.experience_years == null ? null : Number(profile.experience_years),
          hourly_rate: profile.hourly_rate === "" || profile.hourly_rate == null ? null : Number(profile.hourly_rate),
          session_minutes: Number(profile.session_minutes) || 60, available: !!profile.available,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error?.message || "Couldn't save profile");
      setProfile(d.data.mentor);
      setNotice("Profile updated.");
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState title="Unable to load mentor dashboard" body={error} onRetry={load} />;
  if (!data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skel" style={{ height: 92 }} />)}
      </div>
    );
  }

  const stats = [
    ["Upcoming Sessions", data.upcoming.length],
    ["Completed", data.stats.completed],
    ["Pending Requests", data.stats.pending],
    ["Rating", Number(data.stats.rating).toFixed(1)],
    ["Students Helped", data.stats.students],
  ];
  const inputStyle = { width: "100%", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 11px", fontSize: 13 };

  return (
    <div className="space-y-5">
      {notice && <p className="text-[13px]" role="status" style={{ color: "var(--text)" }}>{notice}</p>}

      <section aria-label="Mentor statistics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="text-[22px] font-bold tabular-nums" style={{ color: "var(--text)" }}>{value}</p>
            <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>{label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Session requests">
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Student requests {data.requests.length > 0 && <span style={{ color: "var(--text-muted)" }}>· {data.requests.length}</span>}
        </h2>
        {data.requests.length === 0 ? (
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No pending requests. New bookings appear here for accept or reject.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.requests.map((s) => (
              <li key={s.id} className="rounded-xl border p-3.5" style={{ borderColor: "var(--line)" }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{s.student_name || "Student"}</p>
                  <p className="text-[12px]" style={{ color: "var(--text-muted)" }} suppressHydrationWarning>
                    {s.scheduled_at ? new Date(s.scheduled_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Open request"} · {s.duration_minutes || 30} min
                  </p>
                </div>
                {s.topic && <p className="mt-1 text-[13px] font-medium" style={{ color: "var(--text)" }}>{s.topic}</p>}
                {s.message && <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>“{s.message}”</p>}
                <input
                  value={meeting[s.id] || ""}
                  onChange={(e) => setMeeting((m) => ({ ...m, [s.id]: e.target.value }))}
                  placeholder="Meeting link (optional, e.g. meet.google.com/…)"
                  aria-label="Meeting link"
                  className="mt-2.5"
                  style={inputStyle}
                />
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={busy} onClick={() => decide(s.id, "accept")} className="btn-ink !py-1.5 text-[12.5px] disabled:opacity-50">
                    Accept
                  </button>
                  <button type="button" disabled={busy} onClick={() => decide(s.id, "reject")} className="btn-ghost !py-1.5 text-[12.5px] disabled:opacity-50">
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Upcoming sessions">
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Upcoming {data.upcoming.length > 0 && <span style={{ color: "var(--text-muted)" }}>· {data.upcoming.length}</span>}
        </h2>
        {data.upcoming.length === 0 ? (
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Nothing scheduled. Accepted sessions show up here.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {data.upcoming.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2.5" style={{ borderColor: "var(--line)" }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{s.student_name || "Student"}</p>
                  <p className="text-[12px]" style={{ color: "var(--text-muted)" }} suppressHydrationWarning>
                    {s.scheduled_at ? new Date(s.scheduled_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""} · {s.duration_minutes || 30} min
                  </p>
                </div>
                {s.meeting_url ? (
                  <a href={s.meeting_url} target="_blank" rel="noreferrer" className="btn-ghost !py-1.5 text-[12.5px]">
                    <Video size={13} /> Join
                  </a>
                ) : (
                  <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Add a meeting link when accepting</span>
                )}
                <button type="button" disabled={busy} onClick={() => decide(s.id, "complete")} className="btn-ink !py-1.5 text-[12.5px] disabled:opacity-50">
                  Mark completed
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Manage availability">
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Manage availability</h2>
        <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Students can only book inside these weekly windows.</p>
        <ul className="mt-3 space-y-2">
          {slots.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <select aria-label="Day" value={s.day} onChange={(e) => setSlots((all) => all.map((x, j) => (j === i ? { ...x, day: Number(e.target.value) } : x)))} style={{ ...inputStyle, width: 110 }}>
                {DAYS.map((d, di) => <option key={d} value={di}>{d}</option>)}
              </select>
              <input type="time" aria-label="Start time" value={s.start} onChange={(e) => setSlots((all) => all.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} style={{ ...inputStyle, width: 120 }} />
              <span style={{ color: "var(--text-muted)" }}>–</span>
              <input type="time" aria-label="End time" value={s.end} onChange={(e) => setSlots((all) => all.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} style={{ ...inputStyle, width: 120 }} />
              <button type="button" onClick={() => setSlots((all) => all.filter((_, j) => j !== i))} aria-label="Remove slot" className="rounded-lg p-2 hover:bg-[var(--bg-muted)]" style={{ color: "var(--danger)" }}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setSlots((all) => [...all, { day: 1, start: "10:00", end: "12:00" }])} className="btn-ghost !py-1.5 text-[12.5px]">
            <Plus size={13} /> Add slot
          </button>
          <button type="button" onClick={saveAvailability} disabled={busy} className="btn-ink !py-1.5 text-[12.5px] disabled:opacity-50">
            {busy ? "Saving…" : "Save availability"}
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Edit mentor profile">
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Mentor profile</h2>
          <form onSubmit={saveProfile} className="mt-3 space-y-2.5">
            {[
              ["headline", "Headline", profile.headline || ""],
              ["skills", "Skills (comma separated)", profile.skills || ""],
              ["expertise", "Expertise (comma separated)", profile.expertise || ""],
              ["languages", "Languages (comma separated)", profile.languages || ""],
              ["timezone", "Timezone", profile.timezone || ""],
            ].map(([k, label, v]) => (
              <label key={k} className="block">
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
                <input value={v} onChange={(e) => setProfile((p) => ({ ...p, [k]: e.target.value }))} className="mt-1" style={inputStyle} maxLength={300} />
              </label>
            ))}
            <label className="block">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Bio</span>
              <textarea value={profile.bio || ""} onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))} rows={3} maxLength={1000} className="mt-1" style={inputStyle} />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Exp. (yrs)</span>
                <input type="number" min={0} max={60} value={profile.experience_years ?? ""} onChange={(e) => setProfile((p) => ({ ...p, experience_years: e.target.value }))} className="mt-1" style={inputStyle} />
              </label>
              <label className="block">
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>₹/hour</span>
                <input type="number" min={0} value={profile.hourly_rate ?? ""} onChange={(e) => setProfile((p) => ({ ...p, hourly_rate: e.target.value }))} className="mt-1" style={inputStyle} />
              </label>
              <label className="block">
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Minutes</span>
                <select value={profile.session_minutes || 60} onChange={(e) => setProfile((p) => ({ ...p, session_minutes: Number(e.target.value) }))} className="mt-1" style={inputStyle}>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text)" }}>
              <input type="checkbox" checked={!!profile.available} onChange={(e) => setProfile((p) => ({ ...p, available: e.target.checked }))} />
              Available for new sessions
            </label>
            <button type="submit" disabled={busy} className="btn-ink !py-2 text-[13px] disabled:opacity-50">
              {busy ? "Saving…" : "Save profile"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Student messages">
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Messages</h2>
          {(data.threads || []).length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No conversations yet.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {(data.threads || []).map((t) => (
                <li key={t.partner}>
                  <button
                    type="button"
                    onClick={() => setReplyTo(replyTo === t.partner ? null : t.partner)}
                    aria-expanded={replyTo === t.partner}
                    className="w-full rounded-xl border px-3 py-2.5 text-left transition hover:bg-[var(--bg-muted)]"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <span className="flex items-center justify-between gap-2 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                      {t.partner_name || "Student"}
                      <span className="text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>
                        {t.unread > 0 ? `${t.unread} new` : new Date(t.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: "var(--text-muted)" }}>{t.body}</span>
                  </button>
                  {replyTo === t.partner && (
                    <div className="mt-2">
                      <MessageThread mentorUserId={data.mentor.user_id} receiverId={t.partner} compact />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
