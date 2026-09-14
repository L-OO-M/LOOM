"use client";

import Link from "next/link";
import { Meta, PlainStat } from "@/components/loom/primitives";
import { ActivityStream } from "@/components/loom/Evidence";

/* Admin overview as an operations console, framed by the society's own
   success metrics: Accessibility, Readiness, Excellence, Network.
   Every number below is computed live — never a vanity metric. */

export function AdminDashboard({ outcomes, attention, upcoming, auditEntries }) {
  const waiting = attention.reduce((s, a) => s + a.count, 0);
  const o = outcomes;

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6">
      <Meta>Operations · {new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}</Meta>
      <h1 className="h-product mt-3" style={{ fontSize: "1.8rem" }}>
        {waiting > 0 ? `${waiting} thing${waiting === 1 ? "" : "s"} need${waiting === 1 ? "s" : ""} a human.` : "Nothing waiting. The chapter is humming."}
      </h1>

      <div className="mt-10 grid gap-10 md:grid-cols-2">
        <section aria-label="Accessibility">
          <Meta>Accessibility · beginners, included</Meta>
          <div className="mt-4 space-y-5">
            <PlainStat value={o.accessibility.startedPct} unit="%" label="of students have finished at least one milestone" />
            <PlainStat value={o.accessibility.beginnersActive} unit="active" label="zero-milestone students active this week — the ones not to lose" />
          </div>
        </section>
        <section aria-label="Readiness">
          <Meta>Readiness · documented work</Meta>
          <div className="mt-4 space-y-5">
            <PlainStat value={o.readiness.completion} unit="%" label="average roadmap completion today" />
            <PlainStat value={o.readiness.merges} unit="merges" label="verified open-source merges, all time" />
            <PlainStat value={o.readiness.projects} unit="projects" label="shipped by chapter members" />
          </div>
        </section>
        <section aria-label="Excellence">
          <Meta>Excellence · external proof</Meta>
          <div className="mt-4 space-y-5">
            <PlainStat value={o.excellence.submissions} unit="submissions" label="contest entries awaiting or earning judgment" />
            <PlainStat value={o.excellence.merges} unit="merges" label="into real-world, global projects" />
          </div>
          <p className="narrative mt-4">Victories live in the contests console — review the submissions inbox.</p>
        </section>
        <section aria-label="Network">
          <Meta>Network · feeding back in</Meta>
          <div className="mt-4 space-y-5">
            <PlainStat value={o.network.mentors} unit="mentors" label="guides available to juniors right now" />
            <PlainStat value={o.network.eventsHeld} unit="held" label="gatherings so far, each with its materials archived" />
            <PlainStat value={o.network.partnerships} unit="active" label="chapter partnerships sharing resources" />
          </div>
        </section>
      </div>

      <div className="mt-12 grid gap-12 border-t pt-10 lg:grid-cols-2" style={{ borderColor: "var(--line)" }}>
        <section aria-label="Attention queue">
          <Meta>Attention queue</Meta>
          <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
            {attention.map((a) => (
              <li key={a.href}>
                <Link href={a.href} prefetch={false} className="row-link flex items-baseline justify-between gap-3 px-2 py-3.5">
                  <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{a.label}</span>
                  <span className="figure-mono text-base font-semibold" style={{ color: a.count > 0 ? "var(--accent)" : "var(--text-muted)" }}>
                    {a.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="narrative mt-4">Triage oldest first. Every action you take writes to the audit trail below.</p>
        </section>

        <section aria-label="Upcoming">
          <div className="flex items-baseline justify-between">
            <Meta>Upcoming gatherings</Meta>
            <Link href="/admin/events" prefetch={false} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Manage →</Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="narrative mt-3">Nothing on the calendar. Chapters that gather, grow — schedule the next one.</p>
          ) : (
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-baseline gap-4 py-3">
                  <span className="meta w-24 shrink-0">
                    {new Date(e.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                  </span>
                  <Link href="/admin/events" prefetch={false} className="truncate text-sm font-medium hover:underline" style={{ color: "var(--text)" }}>
                    {e.title}
                  </Link>
                  <span className="meta ml-auto shrink-0">{e.event_type}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-12" aria-label="Audit trail">
        <div className="flex items-baseline justify-between">
          <Meta>Latest admin actions</Meta>
          <Link href="/admin/audit" prefetch={false} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Full log →</Link>
        </div>
        <div className="mt-2">
          {auditEntries.length === 0 ? (
            <p className="narrative mt-3">No admin actions recorded yet. They'll stream in here — who did what, and when.</p>
          ) : (
            <ActivityStream
              items={auditEntries.map((e) => ({
                text: `${e.action.replaceAll("_", " ")} — ${e.resource} ${String(e.resource_id || "").slice(0, 8)}`,
                meta: `${e.actor_id} · ${new Date(e.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
              }))}
            />
          )}
        </div>
      </section>
    </main>
  );
}
