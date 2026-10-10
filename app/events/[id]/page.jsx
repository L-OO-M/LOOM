import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSql, queryTenant } from "@/lib/db";
import { resolveTenantFromHost } from "@/lib/tenant";
import { canonicalFor } from "@/lib/seo";
import { PublicNav } from "@/components/landing/PublicNav";
import { PageHero } from "@/components/landing/PageHero";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { EventBanner } from "../_components/EventBanner";
import { JoinSteps, TypePill, seatsLeft, whenLabel } from "../_components/EventBits";

export const dynamic = "force-dynamic";

async function resolvePublicTenant() {
  try {
    const host = (await headers()).get("host") || "";
    const t = await resolveTenantFromHost(host);
    if (t) return t;
  } catch { /* fall through */ }
  try {
    return await queryTenant(process.env.DEV_TENANT_SLUG || "demo-college");
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  try {
    const tenant = await resolvePublicTenant();
    const sql = getSql();
    const [ev] = await sql`
      SELECT title, description FROM events
      WHERE id = ${id}::uuid
        AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
      LIMIT 1
    `;
    if (!ev) return { title: "Event not found | L.O.O.M." };
    return {
      title: `${ev.title} | L.O.O.M. Events`,
      description: (ev.description || "Event details, seats, and registration.").slice(0, 160),
      ...canonicalFor(`/events/${id}`),
      openGraph: { title: `${ev.title} | L.O.O.M.`, description: (ev.description || "").slice(0, 160) }
    };
  } catch {
    return { title: "Event | L.O.O.M." };
  }
}

export default async function EventDetailPage({ params }) {
  const { id } = await params;
  const tenant = await resolvePublicTenant();
  const tid = tenant?.id ?? null;
  const sql = getSql();

  let event = null;
  let materials = [];
  try {
    const rows = await sql`
      SELECT e.id, e.event_type, e.title, e.description, e.domain,
             e.speaker_name, e.speaker_bio, e.starts_at, e.ends_at, e.location,
             e.capacity, e.registered_count, e.is_online, e.status,
             d.name AS department_name
      FROM events e
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.id = ${id}::uuid
        AND (e.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
        AND e.status IN ('upcoming', 'live', 'past')
      LIMIT 1
    `;
    event = rows[0] || null;
    if (event) {
      const mats = await sql`
        SELECT file_type, title, storage_url FROM event_materials
        WHERE event_id = ${id}::uuid ORDER BY uploaded_at ASC LIMIT 20
      `;
      materials = mats;
    }
  } catch {
    event = null;
  }

  if (!event) notFound();

  const left = seatsLeft(event);
  const full = left === 0;
  const isPast = event.status === "past" || new Date(event.starts_at) < new Date();

  const facts = [
    { label: "When", value: whenLabel(event.starts_at), sub: event.ends_at ? `until ${whenLabel(event.ends_at)}` : null },
    { label: "Where", value: event.is_online ? "Online — link shared with registered members" : (event.location || "Venue announced soon"), sub: event.department_name },
    { label: "Seats", value: left === null ? "Open registration" : full ? "Full — waitlist" : `${left} of ${event.capacity} left`, sub: `${event.registered_count || 0} registered so far` },
    { label: "Track", value: event.domain, sub: event.event_type }
  ];

  return (
    <main className="w-full max-w-full overflow-x-hidden">
      <PublicNav />

      <section className="relative">
        <EventBanner event={event} ratio="21 / 9" />
        <div className="mx-auto max-w-4xl px-5 py-10 sm:px-6 lg:px-8">
          <Link href="/events" prefetch={false} className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
            ← All events
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TypePill type={event.event_type} />
            {isPast && (
              <span className="rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest"
                style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
                Concluded
              </span>
            )}
          </div>
          <h1 className="font-display mt-4 text-4xl font-medium leading-[1.05] sm:text-5xl" style={{ color: "var(--text)" }}>
            {event.title}
          </h1>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label} className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--accent)" }}>{f.label}</p>
                <p className="mt-1.5 text-sm font-semibold capitalize leading-5" style={{ color: "var(--text)" }}>{f.value}</p>
                {f.sub && <p className="mt-1 text-xs capitalize" style={{ color: "var(--text-muted)" }}>{f.sub}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 pb-16 sm:px-6 lg:px-8" aria-label="Event details">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="md:col-span-2">
            <h2 className="font-display text-2xl font-medium" style={{ color: "var(--text)" }}>About this event</h2>
            {event.description ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-7" style={{ color: "var(--text-muted)" }}>{event.description}</p>
            ) : (
              <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
                The organising department has not published a description yet. Everything else — date,
                venue, and seats — is confirmed above.
              </p>
            )}

            {event.speaker_name && (
              <div className="mt-8 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--accent)" }}>Speaker</p>
                <h3 className="mt-2 text-lg font-semibold" style={{ color: "var(--text)" }}>{event.speaker_name}</h3>
                {event.speaker_bio && <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{event.speaker_bio}</p>}
              </div>
            )}

            {materials.length > 0 && (
              <div className="mt-8">
                <h2 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>Materials</h2>
                <ul className="mt-3 space-y-2">
                  {materials.map((m, i) => (
                    <li key={i}>
                      {/* Raw <a> on purpose — downloads must not go through the client router. */}
                      <a href={m.storage_url} target="_blank" rel="noreferrer"
                        className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm hover:underline"
                        style={{ borderColor: "var(--line)", color: "var(--text)" }}>
                        <span>{m.title}</span>
                        <span className="meta capitalize">{m.file_type}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <aside className="md:col-span-1">
            <div className="sticky top-24 rounded-2xl border p-6" style={{ borderColor: "var(--accent)", background: "var(--bg-elevated)" }}>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
                {isPast ? "This event has concluded" : full ? "This event is full" : "Claim your seat"}
              </h2>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                {isPast
                  ? "Registration is closed. Browse the calendar for what is coming next."
                  : full
                    ? "Every seat is taken. Sign in to register anyway and we will hold you a waitlist place."
                    : "Registration takes one click from your dashboard. You get a check-in code immediately."}
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                {!isPast && (
                  <Link href="/login?redirect=/student/events" prefetch={false} className="btn-ink justify-center">
                    Sign in to register
                  </Link>
                )}
                <Link href="/register" prefetch={false} className="btn-ghost justify-center">
                  Create an account
                </Link>
                <Link href="/events" prefetch={false} className="text-center text-xs font-semibold" style={{ color: "var(--accent)" }}>
                  Browse other events →
                </Link>
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-16 border-t pt-12" style={{ borderColor: "var(--line)" }}>
          <p className="kicker">Joining</p>
          <h2 className="font-display mt-2 text-2xl font-medium" style={{ color: "var(--text)" }}>The registration process</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: "var(--text-muted)" }}>
            Registration is tied to your account so attendance, certificates, and your contribution
            record stay connected automatically.
          </p>
          <div className="mt-7"><JoinSteps /></div>
        </div>
      </section>

      <PageHero
        kicker="Never miss one"
        title="The calendar runs all year"
        lede="Workshops, hackathons, talks and contests — posted by department leads as they happen."
        actions={(
          <>
            <Link href="/events" prefetch={false} className="btn-ink justify-center">See all events</Link>
            <Link href="/register" prefetch={false} className="btn-ghost justify-center">Join the chapter</Link>
          </>
        )}
      />
      <PublicFooter />
    </main>
  );
}