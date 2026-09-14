import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, StatusPill } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";
import { RegisterButton } from "./EventsBits";

export const dynamic = "force-dynamic";

const TYPE_LABEL = { workshop: "Workshop", hackathon: "Hackathon", talk: "Talk", mentoring: "Mentoring", contest: "Contest" };

export default async function EventsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/events");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const scope = sp?.scope === "past" ? "past" : "upcoming";

  const events = await sql`
    SELECT e.*, (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS seats_taken,
      EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.student_id = ${user.id} AND r.status <> 'cancelled') AS registered
    FROM events e
    WHERE e.tenant_id = ${tenant?.id ?? null}::uuid AND e.status <> 'cancelled'
      AND ${scope === "past" ? sql`e.starts_at < now()` : sql`e.starts_at >= now() - interval '2 hours'`}
    ORDER BY e.starts_at ${scope === "past" ? sql`DESC` : sql`ASC`}
    LIMIT 50
  `;
  const mine = await sql`
    SELECT r.*, e.title FROM event_registrations r JOIN events e ON e.id = r.event_id
    WHERE r.student_id = ${user.id} AND r.status <> 'cancelled' ORDER BY e.starts_at ASC LIMIT 10
  `;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Meta>Connect · show up, level up</Meta>
        <Display size="lg" className="mt-3">Gatherings worth leaving your room for.</Display>

        <div className="seg mt-7" role="group" aria-label="Event scope">
          <Link href="/student/events" aria-pressed={scope === "upcoming" ? "true" : "false"} className={scope === "upcoming" ? "!bg-[var(--text)] !text-[var(--bg)] rounded-full px-4 py-1.5 text-sm font-semibold" : "rounded-full px-4 py-1.5 text-sm font-semibold"} style={scope === "upcoming" ? undefined : { color: "var(--text-muted)" }}>
            Upcoming
          </Link>
          <Link href="/student/events?scope=past" aria-pressed={scope === "past" ? "true" : "false"} className={scope === "past" ? "!bg-[var(--text)] !text-[var(--bg)] rounded-full px-4 py-1.5 text-sm font-semibold" : "rounded-full px-4 py-1.5 text-sm font-semibold"} style={scope === "past" ? undefined : { color: "var(--text-muted)" }}>
            Past
          </Link>
        </div>

        {mine.length > 0 && scope === "upcoming" && (
          <section className="mt-8 border-y py-5" style={{ borderColor: "var(--line)" }} aria-label="Your seats">
            <Meta style={{ color: "var(--accent)" }}>You're in · {mine.length}</Meta>
            <ul className="mt-3 space-y-2">
              {mine.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <Link href={`/student/events/${r.event_id}`} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>{r.title}</Link>
                  <span className="font-mono text-xs" style={{ color: "var(--accent)" }}>{r.status === "attended" ? "attended ✓" : `door code ${r.check_in_code}`}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {events.length === 0 ? (
          <OnboardingState
            eyebrow={scope === "past" ? "Archive" : "Calendar"}
            title={scope === "past" ? "No history yet." : "Nothing scheduled."}
            why={scope === "past" ? "Past gatherings will archive here with their materials." : "Check back soon — or propose a workshop to your chapter admin. The best events start as someone's idea."}
          />
        ) : (
          <ol className="mt-8">
            {events.map((e) => {
              const full = e.capacity && e.seats_taken >= e.capacity && !e.registered;
              const d = new Date(e.starts_at);
              return (
                <li key={e.id} className="border-b py-6 first:border-t" style={{ borderColor: "var(--line)" }}>
                  <div className="flex gap-5">
                    <div className="w-14 shrink-0 text-center" aria-hidden="true">
                      <p className="figure text-3xl">{d.getDate()}</p>
                      <p className="meta mt-1">{d.toLocaleDateString("en-IN", { month: "short" })}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Link href={`/student/events/${e.id}`} className="text-lg font-semibold hover:underline" style={{ color: "var(--text)" }}>{e.title}</Link>
                        {e.registered && <StatusPill tone="live">you're in</StatusPill>}
                        {full && <StatusPill>full</StatusPill>}
                      </div>
                      <p className="meta mt-1.5">
                        {TYPE_LABEL[e.event_type] || e.event_type} · {d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                        {e.is_online ? " · online" : e.location ? ` · ${e.location}` : ""}
                        {e.capacity ? ` · ${e.seats_taken}/${e.capacity} seats` : ""}
                      </p>
                      {e.speaker_name && <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>with {e.speaker_name}</p>}
                      {scope === "upcoming" && (
                        <div className="mt-3"><RegisterButton eventId={e.id} registered={e.registered} full={full} /></div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </AppShell>
  );
}
