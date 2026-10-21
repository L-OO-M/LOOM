import { redirect } from "next/navigation";
import Link from "next/link";
import { Trophy, Users, FileCheck, Clock3, Download } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { ContestForm } from "@/components/admin-forms";
import { ChallengeStatus } from "./_components/ChallengeStatus";

export const dynamic = "force-dynamic";

const LIVE = new Set(["published", "open", "active"]);

function when(value) {
  return value
    ? new Date(value).toLocaleDateString("en-IN", { month: "short", day: "numeric" })
    : "not set";
}

export default async function LeadChallengesPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/lead/challenges");
  const { user, profile, tenant, sql } = ctx;
  if (!can(profile, "manage_contests").ok) redirect("/student");

  const contests = await sql`
    SELECT c.*,
      (SELECT COUNT(*)::int FROM contest_registrations r WHERE r.contest_id = c.id) AS registrations,
      (SELECT COUNT(*)::int FROM contest_submissions s WHERE s.contest_id = c.id) AS submissions
    FROM contests c
    WHERE c.tenant_id = ${tenant.id}::uuid
    ORDER BY c.created_at DESC LIMIT 50
  `;

  const live = contests.filter((c) => LIVE.has(c.status)).length;
  const registered = contests.reduce((n, c) => n + (c.registrations || 0), 0);
  const entries = contests.reduce((n, c) => n + (c.submissions || 0), 0);

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <PageHeader
          kicker={`Programs · ${contests.length} challenges · ${live} live`}
          title="Challenges"
          desc="Create chapter-wide challenges, open them for registration, and export who signed up. Students see them under Prove → Challenges."
        />

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Live now", value: live, sub: "published / open / active", icon: Trophy },
            { label: "Registered", value: registered, sub: "across all challenges", icon: Users },
            { label: "Entries", value: entries, sub: "submitted work", icon: FileCheck }
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>
                <s.icon size={14} />
              </span>
              <div>
                <p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{s.value}</p>
                <p className="meta">{s.label} · {s.sub}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section aria-label="Chapter challenges">
            <Meta>Newest first</Meta>
            {contests.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No challenges yet</p>
                <p className="narrative mx-auto mt-2 max-w-md">Create a draft on the right. Publish it when the brief and dates are ready, and students can register from their Challenges page.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {contests.map((c) => (
                  <li key={c.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/student/contests/${c.id}`} prefetch={false} className="truncate text-sm font-medium hover:underline" style={{ color: "var(--text)" }}>
                            {c.title}
                          </Link>
                          <span className="mono-tag rounded-full border px-2 py-0.5" style={{ borderColor: LIVE.has(c.status) ? "var(--accent)" : "var(--line)", color: LIVE.has(c.status) ? "var(--accent)" : "var(--text-muted)" }}>
                            {c.status}
                          </span>
                        </div>
                        {c.description && <p className="narrative mt-1 line-clamp-1 text-xs leading-5">{c.description}</p>}
                        <p className="meta mt-1 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1"><Users size={11} /> {c.registrations} registered</span>
                          <span>· {c.submissions} entries</span>
                          <span className="inline-flex items-center gap-1"><Clock3 size={11} /> {when(c.starts_at)} → {c.ends_at ? when(c.ends_at) : "no close"}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <ChallengeStatus id={c.id} status={c.status} />
                        <a
                          href={`/api/contests/export?contestId=${c.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                          style={{ color: "var(--accent)" }}
                        >
                          <Download size={12} /> CSV
                        </a>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="space-y-4">
            <ContestForm endpoint="/api/contests/manage" />
            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Who can do what</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                <li>· Every lead tier can create and publish chapter challenges.</li>
                <li>· The CSV lists name, roll number, branch, year and registration time.</li>
                <li>· Deleting or judging entries stays in the admin contest workspace.</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
