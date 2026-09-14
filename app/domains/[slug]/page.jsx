import Link from "next/link";
import { headers } from "next/headers";
import { getSql, queryTenant } from "@/lib/db";
import { resolveTenantFromHost } from "@/lib/tenant";
import { createServerSupabase } from "@/lib/supabase/server";
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

// Logged-in join button: plain fetch POST to the real join endpoint, so this
// server-rendered page needs no client-component file of its own. A 401
// (logged-out) falls back to the register page.
function JoinButton({ departmentId }) {
  const script = `
    (function () {
      var btn = document.getElementById("dept-join-btn");
      if (!btn) return;
      btn.addEventListener("click", function () {
        btn.disabled = true;
        var original = btn.textContent;
        btn.textContent = "Joining…";
        fetch("/api/departments/${departmentId}/join", { method: "POST" })
          .then(function (r) {
            if (r.status === 401) { window.location.href = "/register"; return null; }
            return r.json();
          })
          .then(function (d) {
            if (!d) return;
            btn.textContent = d && d.ok ? "You are a member ✓" : "Join failed — try again";
            if (!(d && d.ok)) btn.disabled = false;
          })
          .catch(function () { btn.textContent = original; btn.disabled = false; });
      });
    })();
  `;
  return (
    <>
      <button id="dept-join-btn" type="button" className="btn-ink !px-6 !py-3 !text-base">
        Join this department
      </button>
      <script dangerouslySetInnerHTML={{ __html: script }} />
    </>
  );
}

export default async function DomainPage({ params }) {
  const { slug } = await params;
  const tenant = await resolvePublicTenant();
  const tid = tenant?.id ?? null;
  const sql = getSql();

  let dept = null;
  let nodes = [];
  let workshops = [];
  try {
    const [row] = await sql`
      SELECT d.*, hp.name AS head_name, cp.name AS co_head_name,
             (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id) AS members
      FROM departments d
      LEFT JOIN profiles hp ON hp.user_id = d.head_user_id
      LEFT JOIN profiles cp ON cp.user_id = d.co_head_user_id
      WHERE d.slug = ${slug} AND d.is_active
        AND (d.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      LIMIT 1
    `;
    dept = row || null;
    if (dept) {
      nodes = await sql`
        SELECT id, title, description, difficulty_level, sort_order
        FROM roadmap_nodes
        WHERE domain = ${slug}
        ORDER BY sort_order ASC
      `;
      workshops = await sql`
        SELECT id, title, event_type, description, starts_at, ends_at, location, is_online, speaker_name
        FROM events
        WHERE (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
          AND status IN ('upcoming', 'live')
          AND starts_at >= NOW() - INTERVAL '2 hours'
          AND (department_id = ${dept.id} OR domain = ${slug})
        ORDER BY starts_at ASC
        LIMIT 12
      `;
    }
  } catch {
    dept = dept || null;
    nodes = [];
    workshops = [];
  }

  let loggedIn = false;
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    loggedIn = !!user;
  } catch {
    loggedIn = false;
  }

  if (!dept) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
        <BrandMark size={28} />
        <p className="kicker mt-8">Domains</p>
        <h1 className="font-display mt-2 text-4xl font-medium" style={{ color: "var(--text)" }}>
          Domain not found
        </h1>
        <p className="mt-4 leading-7" style={{ color: "var(--text-muted)" }}>
          There is no active department for “{slug}”. It may be inactive, renamed, or still being staffed —{" "}
          <Link prefetch={false} href="/about" className="font-semibold" style={{ color: "var(--accent)" }}>
            see the departments we do run
          </Link>.
        </p>
        <nav className="mt-10 flex flex-wrap gap-4 text-sm font-medium" aria-label="Public pages">
          <Link prefetch={false} href="/" style={{ color: "var(--accent)" }}>← Home</Link>
          <Link prefetch={false} href="/faq" style={{ color: "var(--accent)" }}>FAQ</Link>
          <Link prefetch={false} href="/events" style={{ color: "var(--accent)" }}>Events</Link>
        </nav>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
      <BrandMark size={28} />
      <p className="kicker mt-8">{dept.vertical === "non_technical" ? "Non-technical" : "Technical"} department · {dept.members} member{dept.members === 1 ? "" : "s"}</p>
      <h1 className="font-display mt-2 text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
        {dept.name}
      </h1>
      {dept.description && <p className="mt-4 leading-7" style={{ color: "var(--text-muted)" }}>{dept.description}</p>}
      <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
        Head: {dept.head_name || "— not assigned yet"} · Co-Head: {dept.co_head_name || "— not assigned yet"}
      </p>

      <div className="mt-6">
        {loggedIn ? (
          <JoinButton departmentId={dept.id} />
        ) : (
          <Link prefetch={false} href="/register" className="btn-ink !px-6 !py-3 !text-base">
            Create an account to join
          </Link>
        )}
      </div>

      <h2 className="font-display mt-10 text-2xl font-medium" style={{ color: "var(--text)" }}>Learning roadmap</h2>
      <div className="mt-4 space-y-3">
        {nodes.map((n, i) => (
          <div key={n.id} className="flex gap-4 rounded-xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <span className="font-display text-xl font-medium" style={{ color: "var(--accent)" }}>{String(i + 1).padStart(2, "0")}</span>
            <div>
              <p className="text-base font-medium" style={{ color: "var(--text)" }}>{n.title}</p>
              {n.description && <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{n.description}</p>}
              {n.difficulty_level && <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{n.difficulty_level}</p>}
            </div>
          </div>
        ))}
        {nodes.length === 0 && (
          <div className="rounded-xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Roadmap coming soon.</p>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              The learning path for {dept.name} is still being written. Join the department and you will see it here first.
            </p>
          </div>
        )}
      </div>

      <h2 className="font-display mt-10 text-2xl font-medium" style={{ color: "var(--text)" }}>Upcoming workshops</h2>
      <div className="mt-4 space-y-3">
        {workshops.map((w) => (
          <article key={w.id} className="rounded-xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-base font-medium" style={{ color: "var(--text)" }}>{w.title}</p>
              <span className="text-xs" style={{ color: "var(--accent)" }}>{w.event_type}</span>
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {formatWhen(w.starts_at)} · {w.is_online ? "Online" : (w.location || "Venue announced soon")}
            </p>
            <Link prefetch={false} href="/login" className="mt-3 inline-block text-sm font-semibold" style={{ color: "var(--accent)" }}>
              Register →
            </Link>
          </article>
        ))}
        {workshops.length === 0 && (
          <div className="rounded-xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No workshops scheduled for {dept.name} yet.</p>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              Department leads post workshops through the week. Join the department or check the{" "}
              <Link prefetch={false} href="/events" className="font-semibold" style={{ color: "var(--accent)" }}>
                full calendar
              </Link>.
            </p>
          </div>
        )}
      </div>

      <nav className="mt-10 flex flex-wrap gap-4 text-sm font-medium" aria-label="Public pages">
        <Link prefetch={false} href="/" style={{ color: "var(--accent)" }}>← Home</Link>
        <Link prefetch={false} href="/about" style={{ color: "var(--accent)" }}>About</Link>
        <Link prefetch={false} href="/events" style={{ color: "var(--accent)" }}>Events</Link>
        <Link prefetch={false} href="/faq" style={{ color: "var(--accent)" }}>FAQ</Link>
      </nav>
    </main>
  );
}
