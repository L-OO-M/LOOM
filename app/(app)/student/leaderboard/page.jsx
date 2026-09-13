import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, EmptyState } from "@/components/ui";

const SCOPES = [
  { id: "college", label: "College", desc: "Ranked against students in your college." },
  { id: "global", label: "Global", desc: "Ranked against every student on L.O.O.M." },
  { id: "friends", label: "Friends", desc: "Classmates who linked GitHub, plus you." }
];

export default async function LeaderboardPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/leaderboard");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const scope = SCOPES.some((s) => s.id === sp?.scope) ? sp.scope : "college";
  const tid = tenant?.id ?? null;

  const base = await sql`
    SELECT p.user_id, p.name, p.primary_domain, p.github_username,
      COALESCE(a.commits, 0) AS commits,
      COALESCE(a.pull_requests, 0) AS prs,
      COALESCE(r.done, 0) AS nodes_done,
      COALESCE(prj.count, 0) AS projects,
      (COALESCE(a.commits,0) * 5 + COALESCE(a.pull_requests,0) * 20 + COALESCE(r.done,0) * 30 + COALESCE(prj.count,0) * 25) AS score
    FROM profiles p
    LEFT JOIN (SELECT student_id, SUM(commits)::int AS commits, SUM(pull_requests)::int AS pull_requests FROM student_daily_activity GROUP BY student_id) a ON a.student_id = p.user_id
    LEFT JOIN (SELECT student_id, COUNT(*)::int AS done FROM student_roadmap_progress WHERE status = 'completed' GROUP BY student_id) r ON r.student_id = p.user_id
    LEFT JOIN (SELECT owner_id, COUNT(*)::int AS count FROM projects GROUP BY owner_id) prj ON prj.owner_id = p.user_id
    WHERE ${scope === "global" ? sql`TRUE` : sql`(p.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)`}
    ORDER BY score DESC, p.name ASC
    LIMIT 50
  `;

  // Friends = classmates with a linked GitHub identity, plus yourself.
  // No separate friendship graph exists; this is stated on the page, not hidden.
  const rows = (scope === "friends"
    ? base.filter((r) => r.user_id === user.id || r.github_username)
    : base
  ).map((r, i) => ({ rank: i + 1, ...r }));
  const myRank = rows.findIndex((r) => r.user_id === user.id) + 1;
  const active = SCOPES.find((s) => s.id === scope);

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <PageHeader
          kicker="Rankings"
          title="Leaderboard"
          desc={`${active.desc} Score = commits×5 + PRs×20 + nodes×30 + projects×25.${myRank > 0 ? ` You are #${myRank} of ${rows.length}.` : ""}`}
        />
        <div className="mb-5 flex gap-2">
          {SCOPES.map((s) => {
            const isActive = scope === s.id;
            return (
              <Link
                key={s.id}
                href={`/student/leaderboard${s.id === "college" ? "" : `?scope=${s.id}`}`}
                className="rounded-full px-4 py-1.5 text-sm font-medium transition active:scale-[0.97]"
                style={{
                  background: isActive ? "var(--text)" : "transparent",
                  color: isActive ? "var(--bg)" : "var(--text-muted)",
                  border: isActive ? "none" : "1px solid var(--line)"
                }}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
        {scope === "friends" && (
          <p className="mb-4 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
            Friends here means classmates with a linked GitHub account. Link yours on the GitHub page to appear for others.
          </p>
        )}
        {rows.length === 0 ? (
          <EmptyState
            title="No rankings yet"
            body={scope === "friends" ? "No classmates have linked GitHub yet. Be the first." : "Activity will appear here once students complete nodes and ship code."}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)" }}>
            {rows.map((r, i) => (
              <div key={r.user_id} className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b px-4 py-3 last:border-b-0" style={{ borderColor: "var(--line)", background: r.user_id === user.id ? "var(--accent-glow)" : "var(--bg-elevated)" }}>
                <span className="font-mono text-sm" style={{ color: "var(--text-muted)" }}>#{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium" style={{ color: "var(--text)" }}>{r.name}{r.user_id === user.id ? " (you)" : ""}</span>
                  <span className="block text-xs" style={{ color: "var(--text-muted)" }}>{r.primary_domain || "—"} · {r.nodes_done} nodes · {r.commits} commits · {r.projects} projects</span>
                </span>
                <span className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{r.score}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
