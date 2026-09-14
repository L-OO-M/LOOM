import Link from "next/link";

const LEVELS = [
  {
    name: "General",
    tag: "Everyone starts here",
    body: "Register, join any domain instantly, attend workshops, ship projects. No approval, no interview.",
    how: "Just register below."
  },
  {
    name: "Core",
    tag: "Proven contributors",
    body: "Self-log work, volunteer at events, see your department roster. Granted by your Head after steady work.",
    how: "Join a domain → Request Core from your dashboard."
  },
  {
    name: "Head / Co-Head",
    tag: "Department drivers",
    body: "Run a department: roster, workshops, contribution logs, monthly reports. Both share equal power.",
    how: "Appointed by a Super Admin."
  },
  {
    name: "Vertical Lead",
    tag: "Technical / Non-Technical",
    body: "Coordinate departments in one vertical: calendars, approvals, documentation, succession.",
    how: "Appointed by a Super Admin."
  },
  {
    name: "Super Admin",
    tag: "President, VP, Gen Sec",
    body: "Everything: roles, departments, budgets, reports, handover. The society's root of trust.",
    how: "Claimed once at /setup."
  }
];

/* Who-logs-in-as-what, stated plainly. Levels are earned or granted — never
   self-selected — so this guide explains paths instead of offering a picker
   that would be a self-elevation hole. */
export function LevelGuide({ compact = false }) {
  return (
    <section aria-label="Membership levels" className={compact ? "mt-8" : "mt-10"}>
      <p className="kicker">Five levels, one login</p>
      <h2 className="font-display mt-3 text-2xl font-medium" style={{ color: "var(--text)" }}>
        Where do you fit?
      </h2>
      <ol className="mt-5 space-y-3">
        {LEVELS.map((l, i) => (
          <li key={l.name} className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }} aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{l.name}</h3>
              <span className="meta ml-auto shrink-0">{l.tag}</span>
            </div>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{l.body}</p>
            <p className="mt-1 text-xs font-semibold" style={{ color: "var(--accent)" }}>{l.how}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
        After signing in, each level lands where it works — members in{" "}
        <Link prefetch={false} href="/student" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Home</Link>,
        leads in the console, admins in the overview. Access is enforced server-side, so this page never asks what you are.
      </p>
    </section>
  );
}
