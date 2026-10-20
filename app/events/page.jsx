import Link from "next/link";
import { headers } from "next/headers";
import { getSql, queryTenant } from "@/lib/db";
import { resolveTenantFromHost } from "@/lib/tenant";
import { collectDomains, filterEvents } from "@/lib/events";
import { PublicNav } from "@/components/landing/PublicNav";
import { PageHero } from "@/components/landing/PageHero";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { JsonLd, collectionPageSchema } from "@/components/seo/JsonLd";
import { absoluteUrl, canonicalFor } from "@/lib/seo";
import { EventCard, JoinSteps, TypePill } from "./_components/EventBits";
import { EventBanner } from "./_components/EventBanner";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Events",
  description: "Workshops, hackathons, talks, and contests the chapter actually runs — dates, venues, seats, and how to register.",
  ...canonicalFor("/events"),
  openGraph: {
    title: "Events | L.O.O.M.",
    description: "Workshops, hackathons, talks, and contests from the chapter calendar."
  }
};

async function resolvePublicTenant() {
  try {
    const host = (await headers()).get("host") || "";
    const t = await resolveTenantFromHost(host);
    if (t) return t;
  } catch { /* fall through to default tenant */ }
  try {
    return await queryTenant(process.env.DEV_TENANT_SLUG || "demo-college");
  } catch {
    return null;
  }
}

export default async function EventsPage({ searchParams }) {
  const params = await searchParams;
  const tenant = await resolvePublicTenant();
  const tid = tenant?.id ?? null;
  const sql = getSql();

  let events = [];
  let featured = null;
  try {
    // Sequential on purpose (AGENTS.md §1.5 — one pooled connection, no fan-out).
    events = await sql`
      SELECT e.id, e.event_type, e.title, e.description, e.domain,
             e.speaker_name, e.starts_at, e.ends_at, e.location,
             e.capacity, e.registered_count, e.is_online, e.status,
             d.name AS department_name, d.slug AS department_slug
      FROM events e
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE (e.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
        AND e.status IN ('upcoming', 'live')
        AND e.starts_at >= NOW() - INTERVAL '2 hours'
      ORDER BY e.starts_at ASC
      LIMIT 60
    `;
    const past = await sql`
      SELECT COUNT(*)::int AS n FROM events e
      WHERE (e.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) AND e.starts_at < NOW()
    `;
    featured = events[0] || null;
    events = filterEvents(events, {
      type: params?.type || "all",
      domain: params?.domain || "all"
    });
    var pastCount = past[0].n;
  } catch {
    events = [];
    pastCount = 0;
  }

  const domains = collectDomains(events);
  const nextUp = events.slice(1);

  return (
    <main className="w-full max-w-full overflow-x-hidden">
      <JsonLd
        data={collectionPageSchema({
          name: "L.O.O.M. events",
          path: "/events",
          description: "Upcoming and live workshops, hackathons, talks, and contests run by the chapter.",
          items: events.map((e) => ({ name: e.title, url: absoluteUrl(`/events/${e.id}`) })),
        })}
      />
      <PublicNav />
      <div className="pt-16">
        <PageHero
          kicker="The calendar"
          title="Events we actually run"
          lede="Workshops, hackathons, talks, mentoring sessions and contests — with real dates, real venues, and real seats. Everything here is on the chapter calendar, and registering takes one click from your dashboard."
        />
      </div>

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-6 lg:px-8" aria-label="Filters">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/events" prefetch={false} className="inline-flex min-h-[44px] items-center rounded-full border px-3.5 py-2 text-xs font-semibold"
            style={{ borderColor: params?.type || params?.domain ? "var(--line)" : "var(--accent)", background: params?.type || params?.domain ? "transparent" : "var(--accent)", color: params?.type || params?.domain ? "var(--text-muted)" : "var(--bg)" }}>
            Everything
          </Link>
          {["workshop", "hackathon", "talk", "mentoring", "contest"].map((t) => (
            <Link key={t} href={`/events?type=${t}`} prefetch={false}
              className="inline-flex min-h-[44px] items-center rounded-full border px-3.5 py-2 text-xs font-semibold capitalize"
              style={{ borderColor: params?.type === t ? "var(--accent)" : "var(--line)", background: params?.type === t ? "var(--accent)" : "transparent", color: params?.type === t ? "var(--bg)" : "var(--text-muted)" }}>
              {t}
            </Link>
          ))}
          {/* collectDomains() returns plain strings (lib/events.js, asserted in
              tests/events.test.js). This mapped d.value/d.label, which are
              undefined on a string -- so every chip rendered blank and linked
              to /events?domain=undefined, and the active filter never matched. */}
          {domains.slice(0, 6).map((d) => (
            <Link key={d} href={`/events?domain=${encodeURIComponent(d)}`} prefetch={false}
              className="inline-flex min-h-[44px] items-center rounded-full border px-3.5 py-2 text-xs font-semibold"
              style={{ borderColor: params?.domain === d ? "var(--accent)" : "var(--line)", background: params?.domain === d ? "var(--accent)" : "transparent", color: params?.domain === d ? "var(--bg)" : "var(--text-muted)" }}>
              {d.replace(/_/g, " ")}
            </Link>
          ))}
        </div>
      </section>

      {featured && !params?.type && !params?.domain ? (
        <section className="mx-auto max-w-6xl px-5 pb-14 sm:px-6 lg:px-8" aria-label="Next event">
          <article className="overflow-hidden rounded-3xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <div className="grid md:grid-cols-2">
              <EventBanner event={featured} ratio="4 / 3" className="h-full" />
              <div className="p-7 sm:p-9">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest"
                    style={{ background: "var(--accent)", color: "var(--bg)" }}>
                    Next up
                  </span>
                  <TypePill type={featured.event_type} />
                </div>
                <h2 className="font-display mt-4 text-3xl font-medium leading-tight" style={{ color: "var(--text)" }}>
                  {featured.title}
                </h2>
                <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                  {featured.description || "Details to follow."}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href={`/events/${featured.id}`} prefetch={false} className="btn-ink">Details &amp; registration →</Link>
                  <Link href="/login" prefetch={false} className="btn-ghost">Sign in to register</Link>
                </div>
              </div>
            </div>
          </article>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-5 pb-14 sm:px-6 lg:px-8" aria-label="All upcoming events">
        <h2 className="font-display text-2xl font-medium" style={{ color: "var(--text)" }}>
          {events.length} upcoming {events.length === 1 ? "event" : "events"}
        </h2>
        {events.length > 0 ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        ) : (
          <div className="mt-6 max-w-2xl rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="text-base font-medium" style={{ color: "var(--text)" }}>
              {params?.type || params?.domain ? "Nothing matches that filter right now." : "No upcoming events right now."}
            </p>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              Workshops are posted by department leads through the week.{" "}
              {pastCount > 0 ? `${pastCount} event${pastCount === 1 ? " has" : "s have"} already run this chapter.` : " "}
              Create an account and you will see new ones the moment they are scheduled.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/events" prefetch={false} className="btn-ghost">Clear filters</Link>
              <Link href="/register" prefetch={false} className="btn-ink">Get started</Link>
            </div>
          </div>
        )}
      </section>

      <section className="border-t" style={{ borderColor: "var(--line)" }} aria-label="How to join">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:px-8">
          <p className="kicker">Joining</p>
          <h2 className="font-display mt-2 text-3xl font-medium" style={{ color: "var(--text)" }}>
            How to get into an event
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: "var(--text-muted)" }}>
            No invite codes, no email chains. Registration happens inside your account so attendance,
            certificates, and your contribution record all stay connected.
          </p>
          <div className="mt-8"><JoinSteps /></div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}