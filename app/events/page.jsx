import Link from "next/link";
import { headers } from "next/headers";
import { getSql, queryTenant } from "@/lib/db";
import { resolveTenantFromHost } from "@/lib/tenant";
import { BrandMark } from "@/components/BrandMark";

export const dynamic = "force-dynamic";

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
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
      <BrandMark size={28} />
      <p className="kicker mt-8">Workshops, hackathons, talks</p>
      <h1 className="font-display mt-2 text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
        Upcoming events
      </h1>
      <p className="mt-4 leading-7" style={{ color: "var(--text-muted)" }}>
        Real workshops from the chapter calendar. To reserve a seat,{" "}
        <Link prefetch={false} href="/login" className="font-semibold" style={{ color: "var(--accent)" }}>
          sign in
        </Link>{" "}
        and register from your dashboard.
      </p>
      <div className="mt-8 space-y-3">
        {events.map((e) => (
          <article key={e.id} className="rounded-xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-medium" style={{ color: "var(--text)" }}>{e.title}</h2>
              <span className="text-xs" style={{ color: "var(--accent)" }}>{e.event_type}</span>
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {formatWhen(e.starts_at)} · {e.is_online ? "Online" : (e.location || "Venue announced soon")}
              {e.department_name ? ` · ${e.department_name}` : ""}
              {e.speaker_name ? ` · by ${e.speaker_name}` : ""}
            </p>
            {e.description && <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{e.description}</p>}
            <Link prefetch={false} href="/login" className="mt-3 inline-block text-sm font-semibold" style={{ color: "var(--accent)" }}>
              Register →
            </Link>
          </article>
        ))}
        {events.length === 0 && (
          <div className="rounded-xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No upcoming events right now.</p>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              Workshops are posted by department leads through the week. Check back soon — or{" "}
              <Link prefetch={false} href="/login" className="font-semibold" style={{ color: "var(--accent)" }}>
                sign in
              </Link>{" "}
              so you never miss one.
            </p>
          </div>
        )}
      </div>
      <nav className="mt-10 flex flex-wrap gap-4 text-sm font-medium" aria-label="Public pages">
        <Link prefetch={false} href="/" style={{ color: "var(--accent)" }}>← Home</Link>
        <Link prefetch={false} href="/about" style={{ color: "var(--accent)" }}>About</Link>
        <Link prefetch={false} href="/faq" style={{ color: "var(--accent)" }}>FAQ</Link>
      </nav>
    </main>
  );
}
