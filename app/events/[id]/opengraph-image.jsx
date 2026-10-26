import { ImageResponse } from "next/og";
import { getSql } from "@/lib/db";
import { resolveRequestTenant } from "@/lib/tenant";
import { absoluteUrl } from "@/lib/seo";
import { EVENT_CARD_SIZE, EventCard, EventCardNotFound } from "@/lib/eventCard";

export const revalidate = 300;
export const alt = "LOOM event";
export const contentType = "image/png";
export const size = EVENT_CARD_SIZE;

export default async function Image({ params }) {
  const { id } = await params;

  let event = null;
  try {
    const tenant = await resolveRequestTenant();
    if (tenant) {
      const sql = getSql();
      const [row] = await sql`
        SELECT id, event_type, title, description, domain,
               starts_at, ends_at, location, capacity, registered_count,
               is_online, status
        FROM events
        WHERE id = ${id}::uuid
          AND tenant_id = ${tenant.id}::uuid
          AND status IN ('upcoming', 'live', 'past')
        LIMIT 1
      `;
      event = row || null;
    }
  } catch {
    event = null;
  }

  if (!event) {
    return new ImageResponse(<EventCardNotFound />, EVENT_CARD_SIZE);
  }

  return new ImageResponse(
    <EventCard event={{ ...event, siteUrl: absoluteUrl("/events") }} />,
    EVENT_CARD_SIZE
  );
}
