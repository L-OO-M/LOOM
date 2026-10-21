"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Download, Info, MapPin, Sparkles } from "lucide-react";
import {
  buildCalendarItems,
  filterSessions,
  formatWeekRange,
  isDeferred,
  plannerAlerts,
  PLANNER_TRACKS,
  sessionDate,
  sessionsForWeek,
  trackLabel,
} from "@/lib/planner";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const MODE_LABEL = {
  live: "Live",
  async: "Async pack",
  recorded: "Recorded",
  project: "Project time",
  deferred: "Deferred",
  assessment: "Assessment",
  showcase: "Showcase",
  none: "No session",
};

export function isPlannerTrack(key) {
  return PLANNER_TRACKS.some((t) => t.key === key);
}

function currentWeek(weeks, today) {
  const found = weeks.find((w) => today >= w.starts_on && today <= w.ends_on);
  return found ? found.week_number : weeks[0]?.week_number ?? 1;
}

/**
 * The collective calendar, scoped.
 *
 * Students land on their own wing ("mine") and get one deliberate second view
 * of every other wing ("all") so a member can see what is running elsewhere
 * before deciding to pursue or switch. Leads and admins pass `defaultMode="all"`
 * because the whole calendar is their job.
 */
export function PlannerBoard({ weeks, sessions, events, primaryDomain, today, defaultMode }) {
  const now = useMemo(() => new Date(`${today}T00:00:00Z`), [today]);
  const hasWing = isPlannerTrack(primaryDomain);
  const initialMode = defaultMode || (hasWing ? "mine" : "all");
  const [mode, setMode] = useState(initialMode);
  const [track, setTrack] = useState(initialMode === "mine" && hasWing ? primaryDomain : "all");
  const [weekNumber, setWeekNumber] = useState(() => currentWeek(weeks, today));

  const activeTrack = mode === "mine" && hasWing ? primaryDomain : track;
  const selectedWeek = weeks.find((w) => w.week_number === weekNumber) || weeks[0] || null;
  const weekSessions = useMemo(() => sessionsForWeek(sessions, weekNumber), [sessions, weekNumber]);
  const visibleSessions = useMemo(() => filterSessions(weekSessions, activeTrack), [weekSessions, activeTrack]);
  const items = useMemo(() => buildCalendarItems({ weeks, sessions, events }), [weeks, sessions, events]);
  const alerts = useMemo(() => plannerAlerts({ weeks, items, now }), [weeks, items, now]);
  const weekEvents = useMemo(() => events.filter((e) => e.planner_week === weekNumber), [events, weekNumber]);

  const scheduled = visibleSessions.filter((s) => !isDeferred(selectedWeek, s));
  const deferred = visibleSessions.filter((s) => isDeferred(selectedWeek, s));

  const byDay = DAY_NAMES.map((label, i) => ({
    label,
    sessions: scheduled.filter((s) => Number(s.day_of_week) === i + 1),
  })).filter((d) => d.sessions.length > 0);

  return (
    <div className="mt-8 space-y-5">
      <RelaxationBanner alert={alerts.relaxation} />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          {hasWing ? (
            <div role="group" aria-label="Choose calendar scope" className="flex flex-wrap items-center gap-1.5">
              {[
                { key: "mine", label: `My wing · ${trackLabel(primaryDomain)}` },
                { key: "all", label: "Explore other wings" },
              ].map((o) => {
                const active = mode === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setMode(o.key);
                      if (o.key === "all" && track === primaryDomain) setTrack("all");
                    }}
                    className="rounded-full border px-3.5 py-1.5 text-xs font-medium transition"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--line)",
                      background: active ? "color-mix(in srgb, var(--accent) 12%, var(--bg))" : "var(--bg)",
                      color: active ? "var(--text)" : "var(--text-muted)",
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="narrative text-xs">
              You have not picked a wing yet, so this shows the whole calendar. Choose your domain in
              <Link href="/student/settings" prefetch={false} className="mx-1 underline" style={{ color: "var(--accent)" }}>settings</Link>
              to focus it.
            </p>
          )}

          {mode === "all" ? (
            <div className="mt-4">
              <div role="group" aria-label="Filter by wing" className="flex flex-wrap gap-1.5">
                {[{ key: "all", label: "All wings" }, ...PLANNER_TRACKS.map((t) => ({ key: t.key, label: t.short })), { key: "general", label: "Society" }].map((o) => {
                  const active = track === o.key;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setTrack(o.key)}
                      className="rounded-full border px-3 py-1 text-[11px] font-medium transition"
                      style={{
                        borderColor: active ? "var(--accent)" : "var(--line)",
                        background: active ? "color-mix(in srgb, var(--accent) 10%, var(--bg))" : "var(--bg)",
                        color: active ? "var(--text)" : "var(--text-muted)",
                      }}
                    >
                      {o.label}
                    </button>
                  );
                })}
                {track !== "all" && track !== "general" ? (
                  <Link
                    href={`/student/roadmap?domain=${track}`}
                    prefetch={false}
                    className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium"
                    style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                  >
                    Explore {trackLabel(track)} →
                  </Link>
                ) : null}
              </div>
              <p className="meta mt-2.5 text-[11px]">
                Browse another wing — or all of them. Your own wing stays on the first tab.
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex items-end justify-between gap-3">
            <div>
              <p className="meta">Week {String(weekNumber).padStart(2, "0")} of 28</p>
              <h2 className="h-product mt-1" style={{ fontSize: "1.15rem" }}>
                {selectedWeek?.theme || "Planner week"}
              </h2>
              <p className="meta mt-1">{selectedWeek ? formatWeekRange(selectedWeek) : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedWeek?.is_relaxation ? <span className="pill">Relaxation</span> : null}
              {!selectedWeek?.is_relaxation && selectedWeek?.is_protected ? <span className="pill">Exam protection</span> : null}
              <a
                href={`/api/planner/ics?track=${activeTrack}`}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: "var(--line)", color: "var(--text)" }}
              >
                <Download size={13} /> Export .ics
              </a>
            </div>
          </div>

          {selectedWeek?.notes ? <p className="narrative mt-2 text-sm">{selectedWeek.notes}</p> : null}

          {byDay.length === 0 && weekEvents.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                {selectedWeek?.is_relaxation
                  ? "Relaxation week — nothing scheduled."
                  : mode === "mine"
                    ? "No session in your wing this week."
                    : "Nothing scheduled in this filter."}
              </p>
              <p className="narrative mx-auto mt-2 max-w-md text-sm">
                {selectedWeek?.is_relaxation
                  ? "Live sessions pause from 20 Nov to 20 Dec 2026. Deferred curriculum appears below."
                  : mode === "mine"
                    ? "Your wing may not run a session every week. Try another week, or explore what other wings are doing."
                    : "Try another wing, or another week in the strip below."}
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {byDay.map((day) => (
                <div key={day.label}>
                  <p className="meta">{day.label}</p>
                  <ul className="mt-2 space-y-2">
                    {day.sessions.map((s) => (
                      <SessionRow key={s.id} week={selectedWeek} session={s} />
                    ))}
                  </ul>
                </div>
              ))}

              {weekEvents.length > 0 ? (
                <div>
                  <p className="meta">Society</p>
                  <ul className="mt-2 space-y-2">
                    {weekEvents.map((e) => (
                      <li key={e.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="pill">{e.planner_kind || e.event_type}</span>
                          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{e.title}</p>
                        </div>
                        {e.description ? <p className="narrative mt-1 text-xs">{e.description}</p> : null}
                        <p className="meta mt-1 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> {new Date(e.starts_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span>
                          {e.location ? <span className="inline-flex items-center gap-1"><MapPin size={11} /> {e.location}</span> : null}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          {deferred.length > 0 ? (
            <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <p className="meta flex items-center gap-1.5">
                <Info size={12} /> Deferred during the relaxation window
              </p>
              <p className="narrative mt-1 text-xs">
                These units are paused and shift to the first available post-window slot. They are not live dates.
              </p>
              <ul className="mt-3 space-y-2">
                {deferred.map((s) => (
                  <li key={s.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="pill">{trackLabel(s.track_domain)}</span>
                      {s.curriculum_ref ? <span className="meta font-mono">{s.curriculum_ref}</span> : null}
                      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{s.title}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <aside className="space-y-4">
          <AlertCard alerts={alerts} />
          <WeekStrip weeks={weeks} value={weekNumber} onChange={setWeekNumber} />
        </aside>
      </div>
    </div>
  );
}

function SessionRow({ week, session }) {
  const date = sessionDate(week, session);
  const time = session.starts_time ? `${session.starts_time.slice(0, 5)}${session.ends_time ? `–${session.ends_time.slice(0, 5)}` : ""}` : null;
  return (
    <li className="rounded-xl border p-3 transition hover:-translate-y-0.5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="pill">{trackLabel(session.track_domain)}</span>
        {session.curriculum_ref ? <span className="meta font-mono">{session.curriculum_ref}</span> : null}
        <span className="meta">{MODE_LABEL[session.delivery_mode] || session.delivery_mode}</span>
        {session.is_required ? <span className="meta">Required</span> : <span className="meta">Optional</span>}
        {session.owner_name ? <span className="meta">· {session.owner_name}</span> : null}
      </div>
      <p className="mt-1.5 text-sm font-medium" style={{ color: "var(--text)" }}>{session.title}</p>
      <p className="meta mt-1 flex flex-wrap items-center gap-2">
        {date ? <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> {new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", day: "numeric", timeZone: "UTC" })}</span> : null}
        {time ? <span>{time} IST</span> : null}
        {session.session_kind ? <span>{session.session_kind}</span> : null}
      </p>
      {session.notes ? <p className="narrative mt-1 text-xs">{session.notes}</p> : null}
    </li>
  );
}

function RelaxationBanner({ alert }) {
  if (!alert?.active && !alert?.upcoming) return null;
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--accent) 8%, var(--bg))" }}>
      <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
        <Sparkles size={14} /> {alert.label}
      </p>
      <p className="narrative mt-1 text-xs">
        Window {alert.startsOn} to {alert.endsOn}. No workshops, labs or society events are scheduled.
      </p>
    </div>
  );
}

function AlertCard({ alerts }) {
  const next = alerts.next;
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <p className="meta">Next up</p>
      {next ? (
        <>
          <p className="mt-2 text-sm font-semibold" style={{ color: "var(--text)" }}>{next.title}</p>
          <p className="meta mt-1">
            {new Date(`${next.date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
            {next.startsTime ? ` · ${next.startsTime} IST` : ""}
          </p>
          <p className="meta mt-1">{next.kind === "event" ? "Society event" : trackLabel(next.track)}</p>
        </>
      ) : (
        <p className="narrative mt-2 text-sm">No upcoming session in the seeded calendar.</p>
      )}
    </div>
  );
}

function WeekStrip({ weeks, value, onChange }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <p className="meta">Jump to week</p>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {weeks.map((w) => {
          const active = w.week_number === value;
          const tone = w.is_relaxation ? "color-mix(in srgb, var(--accent) 10%, var(--bg))" : w.is_protected ? "color-mix(in srgb, var(--text-muted) 10%, var(--bg))" : "var(--bg)";
          return (
            <button
              key={w.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(w.week_number)}
              className="rounded-lg border px-1.5 py-2 text-center text-xs font-mono transition"
              style={{
                borderColor: active ? "var(--accent)" : "var(--line)",
                background: active ? "color-mix(in srgb, var(--accent) 14%, var(--bg))" : tone,
                color: "var(--text)",
              }}
              title={`${w.starts_on} – ${w.ends_on}`}
            >
              W{String(w.week_number).padStart(2, "0")}
            </button>
          );
        })}
      </div>
      <p className="meta mt-3 text-[11px]">
        Highlighted weeks are relaxation or exam-protected.
      </p>
    </div>
  );
}
