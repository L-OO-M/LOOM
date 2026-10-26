import { getSql } from "@/lib/db";
import { resolveRequestTenant } from "@/lib/tenant";
import { collectDomains, filterEvents } from "@/lib/events";
import { JsonLd, collectionPageSchema } from "@/components/seo/JsonLd";
import { absoluteUrl, canonicalFor } from "@/lib/seo";

import EventsCalendar from "./_components/EventsCalendar";
import "./events.css";


export const dynamic = "force-dynamic";

export const metadata = {
  title: "Events",
  description: "Workshops, hackathons, talks, and contests the chapter actually runs — dates, venues, seats, and how to register.",
  ...canonicalFor("/events"),
  openGraph: {
    title: "Events | LOOM",
    description: "Workshops, hackathons, talks, and contests from the chapter calendar.",
    url: absoluteUrl("/events"),
    images: [{ url: absoluteUrl("/loom-og.png"), width: 1200, height: 630, alt: "LOOM events calendar" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Events | LOOM",
    description: "Workshops, hackathons, talks, and contests from the chapter calendar.",
    images: [absoluteUrl("/loom-og.png")]
  }
};

export default async function EventsPage({ searchParams }) {
  const params = await searchParams;
  const tenant = await resolveRequestTenant();
  const tid = tenant?.id ?? null;

  let events = [];
  let pastCount = 0;
  let loadError = false;
  try {
    const sql = getSql();
    // Sequential on purpose (AGENTS.md §1.5 — one pooled connection, no fan-out).
    // Fail closed: without a resolved tenant the UUID predicate matches nothing,
    // instead of the old `OR tenant_id IS NULL` aliasing every chapter's events.
    events = await sql`
      SELECT e.id, e.event_type, e.title, e.description, e.domain,
             e.speaker_name, e.starts_at, e.ends_at, e.location,
             e.capacity, e.registered_count, e.is_online, e.status,
             d.name AS department_name, d.slug AS department_slug
      FROM events e
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.tenant_id = ${tid}::uuid
        AND e.status IN ('upcoming', 'live')
        AND e.starts_at >= NOW() - INTERVAL '2 hours'
      ORDER BY e.starts_at ASC
      LIMIT 60
    `;
    const past = await sql`
      SELECT COUNT(*)::int AS n FROM events e
      WHERE e.tenant_id = ${tid}::uuid AND e.starts_at < NOW()
    `;
    events = filterEvents(events, {
      type: params?.type || "all",
      domain: params?.domain || "all"
    });
    pastCount = past[0].n;
  } catch {
    events = [];
    pastCount = 0;
    loadError = true;
  }

  const domains = collectDomains(events);

  return (
    <>
      <JsonLd data={collectionPageSchema({
        name: "LOOM events", path: "/events",
        description: "Upcoming and live workshops, hackathons, talks, and contests run by the chapter.",
        items: events.map((event) => ({ name: event.title, url: absoluteUrl(`/events/${event.id}`) }))
      })} />
      <EventsCalendar events={events} domains={domains} pastCount={pastCount} loadError={loadError} type={params?.type || "all"} domain={params?.domain || "all"} />
    </>
  );
}
