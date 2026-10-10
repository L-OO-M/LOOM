/* Shared presentation for public event surfaces (/events, /events/[id]).
 * Co-located: used only by the public events routes. */

import Link from "next/link";
import { TYPE_LABEL } from "@/lib/events";
import { EventBanner } from "./EventBanner";

export function whenLabel(value) {
  try {
    return new Date(value).toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    });
  } catch {
    return String(value);
  }
}

export function dayLabel(value) {
  try {
    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function seatsLeft(event) {
  const cap = Number(event.capacity);
  const taken = Number(event.registered_count || 0);
  if (!cap) return null;
  return Math.max(0, cap - taken);
}

/** Type pill. Colours are fixed here because they encode meaning, not theme. */
export function TypePill({ type }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest"
      style={{ border: "1px solid #e8c26a", color: "#e8c26a" }}
    >
      {TYPE_LABEL[type] || type || "Event"}
    </span>
  );
}

/** Big readable event card used on /events. */
export function EventCard({ event }) {
  const left = seatsLeft(event);
  return (
    <article
      className="group overflow-hidden rounded-2xl border transition hover:shadow-lg"
      style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
    >
      <Link href={`/events/${event.id}`} prefetch={false} className="block">
        <EventBanner event={event} />
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <TypePill type={event.event_type} />
            {event.department_name && (
              <span className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                {event.department_name}
              </span>
            )}
          </div>
          <h3 className="font-display mt-3 text-xl font-medium leading-snug" style={{ color: "var(--text)" }}>
            {event.title}
          </h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            {event.description || "Details to follow."}
          </p>
          <dl className="mt-4 space-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
            <div className="flex items-center justify-between gap-3">
              <dt>When</dt>
              <dd className="text-right" style={{ color: "var(--text)" }}>{whenLabel(event.starts_at)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Where</dt>
              <dd className="truncate text-right" style={{ color: "var(--text)" }}>
                {event.is_online ? "Online" : (event.location || "Venue announced soon")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Seats</dt>
              <dd className="text-right" style={{ color: left === 0 ? "var(--danger)" : "var(--text)" }}>
                {left === null
                  ? "Open registration"
                  : left === 0
                    ? "Full — waitlist only"
                    : `${left} of ${event.capacity} left`}
              </dd>
            </div>
          </dl>
        </div>
      </Link>
    </article>
  );
}

/** The four steps a visitor actually goes through, stated plainly. */
export function JoinSteps() {
  const steps = [
    { n: "01", t: "Create your account", d: "Register with your college email at /register. One form, no approval queue." },
    { n: "02", t: "Sign in", d: "Your dashboard is the hub — roadmap, projects, mentors, and every event you have joined." },
    { n: "03", t: "Claim your seat", d: "Open the event from your dashboard and register. You get a check-in code on the spot." },
    { n: "04", t: "Show up, get proof", d: "Check in with your code. Attendees receive a verifiable certificate they can share anywhere." }
  ];
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s) => (
        <li key={s.n} className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <p className="font-mono text-xs font-bold tracking-[0.2em]" style={{ color: "var(--accent)" }}>{s.n}</p>
          <h3 className="mt-2 text-sm font-semibold" style={{ color: "var(--text)" }}>{s.t}</h3>
          <p className="mt-1.5 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{s.d}</p>
        </li>
      ))}
    </ol>
  );
}