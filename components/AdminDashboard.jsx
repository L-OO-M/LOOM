"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { Meta, PlainStat } from "@/components/loom/primitives";
import { ActivityStream } from "@/components/loom/Evidence";

/* Admin overview as an operations console: cohort health, the attention
   queue, what's next, and the audit trail. No student-dashboard reuse. */

export function AdminDashboard({ health, attention, upcoming, auditEntries }) {
  const waiting = attention.reduce((s, a) => s + a.count, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6">
      <Meta>Operations · {new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}</Meta>
      <h1 className="h-product mt-3" style={{ fontSize: "1.8rem" }}>
        {waiting > 0 ? `${waiting} thing${waiting === 1 ? "" : "s"} need${waiting === 1 ? "s" : ""} a human.` : "Nothing waiting. The chapter is humming."}
      </h1>

      <section className="mt-8 border-y py-7" style={{ borderColor: "var(--line)" }} aria-label="Cohort health">
        <div className="grid gap-8 sm:grid-cols-4">
          <PlainStat value={health.students} unit="students" label="on the roster" />
          <PlainStat value={health.active7d} unit="active" label="in the last 7 days" />
          <PlainStat value={`${Math.round(health.completion)}`} unit="%" label="avg. roadmap completion" />
          <PlainStat value={health.events24h} unit="events" label="GitHub events in 24h" />
        </div>
      </section>

      <div className="mt-10 grid gap-12 lg:grid-cols-2">
        <section aria-label="Attention queue">
          <Meta>Attention queue</Meta>
          <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
            {attention.map((a) => (
              <li key={a.href}>
                <Link href={a.href} className="row-link flex items-baseline justify-between gap-3 px-2 py-3.5">
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
            <Link href="/admin/events" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Manage →</Link>
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
                  <Link href="/admin/events" className="truncate text-sm font-medium hover:underline" style={{ color: "var(--text)" }}>
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
          <Link href="/admin/audit" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Full log →</Link>
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
