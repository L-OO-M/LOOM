import Link from "next/link";
import { headers } from "next/headers";
import { getSql, queryTenant } from "@/lib/db";
import { resolveTenantFromHost } from "@/lib/tenant";
import { PublicNav } from "@/components/landing/PublicNav";
import { PageHero } from "@/components/landing/PageHero";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { canonicalFor } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Events",
  description: "Real workshops, hackathons, and talks from the chapter calendar — the year-round rhythm. Reserve a seat from your dashboard.",
  ...canonicalFor("/events"),
  openGraph: {
    title: "Events | L.O.O.M.",
    description: "Workshops, hackathons, and talks from the chapter calendar."
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

function formatWhen(value) {
  try {
    return new Date(value).toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit"
    });
  } catch {
    return String(value);
  }
}

export default async function EventsPage() {
  const tenant = await resolvePublicTenant();
  const tid = tenant?.id ?? null;
  const sql = getSql();
  let events = [];
  try {
    events = await sql`
      SELECT e.id, e.event_type, e.title, e.description, e.domain,
             e.speaker_name, e.starts_at, e.ends_at, e.location,
             e.capacity, e.is_online, d.name AS department_name, d.slug AS department_slug
      FROM events e
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE (e.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
        AND e.status IN ('upcoming', 'live')
        AND e.starts_at >= NOW() - INTERVAL '2 hours'
      ORDER BY e.starts_at ASC
      LIMIT 50
    `;
  } catch {
    events = [];
  }

  return (
    <main className="w-full max-w-full overflow-x-hidden">
      <PublicNav />
      <div className="pt-16">
        <PageHero
          kicker="Workshops, hackathons, talks"
          title="Upcoming events"
          lede="Real workshops from the chapter calendar — the year-round rhythm, not once-a-semester theatre. To reserve a seat, sign in and register from your dashboard."
        />
      </div>

      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20" aria-label="Calendar">
        <p className="kicker">Thread 01 — The calendar</p>
        {events.length > 0 ? (
          <ol className="relative mt-8">
            <span aria-hidden="true" className="absolute bottom-4 left-[7px] top-2 w-px"
              style={{ background: "linear-gradient(to bottom, var(--accent), var(--line))" }} />
            {events.map((e) => (
              <li key={e.id} className="relative pb-8 pl-9 last:pb-0">
                <span aria-hidden="true" className="absolute left-0 top-1.5 grid size-4 place-items-center rounded-full border" style={{ borderColor: "var(--accent)", background: "var(--bg)" }}>
                  <span className="size-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                </span>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>
                  {formatWhen(e.starts_at)} · {e.event_type}
                </p>
                <h2 className="font-display mt-1 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>{e.title}</h2>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {e.is_online ? "Online" : (e.location || "Venue announced soon")}
                  {e.department_name ? ` · ${e.department_name}` : ""}
                  {e.speaker_name ? ` · by ${e.speaker_name}` : ""}
                </p>
                {e.description && <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>{e.description}</p>}
                <Link prefetch={false} href="/login" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--accent)" }}>
                  Register →
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-8 max-w-2xl rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="text-base font-medium" style={{ color: "var(--text)" }}>No upcoming events right now.</p>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              Workshops are posted by department leads through the week. Check back soon — or{" "}
              <Link prefetch={false} href="/login" className="font-semibold" style={{ color: "var(--accent)" }}>
                sign in
              </Link>{" "}
              so you never miss one.
            </p>
          </div>
        )}

        <div className="mt-12 rounded-2xl border p-6 text-center sm:p-8" style={{ borderColor: "var(--accent)", background: "var(--bg-elevated)" }}>
          <p className="font-display text-2xl font-medium" style={{ color: "var(--text)" }}>Seats go to members first.</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            Registration, reminders, and certificates all live inside your dashboard.
          </p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" prefetch={false} className="btn-ink justify-center">Get started</Link>
            <Link href="/login" prefetch={false} className="btn-ghost justify-center">Sign in</Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
