import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";

const SCOPES = [
  { id: "college", label: "College", desc: "Students in your college." },
  { id: "global", label: "Everywhere", desc: "Every student on L.O.O.M." },
  { id: "friends", label: "Circle", desc: "Classmates with linked GitHub, plus you." }
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

  // Circle = classmates with a linked GitHub identity, plus yourself.
  // No separate friendship graph exists; this is stated, not hidden.
  const rows = (scope === "friends"
    ? base.filter((r) => r.user_id === user.id || r.github_username)
    : base
  ).map((r, i) => ({ rank: i + 1, ...r }));
  const myRank = rows.findIndex((r) => r.user_id === user.id) + 1;
  const me = rows.find((r) => r.user_id === user.id);
  const active = SCOPES.find((s) => s.id === scope);

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Meta>Prove · {active.desc}</Meta>
        <Display size="lg" className="mt-3">Where the chapter stands.</Display>

        <div className="seg mt-7" role="group" aria-label="Ranking scope">
          {SCOPES.map((s) => (
            <Link
              key={s.id}
              href={`/student/leaderboard${s.id === "college" ? "" : `?scope=${s.id}`}`}
              aria-pressed={scope === s.id ? "true" : "false"}
              className={scope === s.id ? "!bg-[var(--text)] !text-[var(--bg)] rounded-full px-4 py-1.5 text-sm font-semibold" : "rounded-full px-4 py-1.5 text-sm font-semibold"}
              style={scope === s.id ? undefined : { color: "var(--text-muted)" }}
            >
              {s.label}
            </Link>
          ))}
        </div>

        {myRank > 0 && (
          <p className="mt-6 text-sm" style={{ color: "var(--text-muted)" }}>
            You are <strong className="font-mono font-semibold" style={{ color: "var(--text)" }}>#{myRank}</strong> of {rows.length}
            {me ? <> — {me.nodes_done} nodes · {me.commits} commits · {me.projects} projects</> : ""}.
          </p>
        )}

        {rows.length === 0 ? (
          <OnboardingState
            eyebrow="Standings"
            title="Nobody on the board yet."
            why={scope === "friends" ? "No classmates have linked GitHub yet. Link yours and be the first name here." : "Standings fill in once students complete nodes and ship code. Early days are the best time to climb."}
            action={<Link href="/student/github" className="btn-ink">Connect GitHub →</Link>}
          />
        ) : (
          <>
            <ol className="mt-6">
              {rows.slice(0, 10).map((r) => (
                <li key={r.user_id} className="border-b py-4 first:border-t" style={{ borderColor: "var(--line)", background: r.user_id === user.id ? "color-mix(in srgb, var(--accent) 6%, transparent)" : "transparent" }}>
                  <div className="flex items-baseline gap-4 px-2">
                    <span className="index-num w-8 shrink-0">{String(r.rank).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.98rem] font-semibold" style={{ color: "var(--text)" }}>
                        {r.name}{r.user_id === user.id ? " · you" : ""}
                      </span>
                      <span className="meta mt-0.5 block">{r.primary_domain || "exploring"} · {r.nodes_done} nodes · {r.commits} commits · {r.projects} projects</span>
                    </span>
                    <span className="figure-mono shrink-0 text-base font-semibold" style={{ color: r.rank <= 3 ? "var(--accent)" : "var(--text)" }}>{r.score}</span>
                  </div>
                </li>
              ))}
            </ol>
            {rows.length > 10 && <p className="meta mt-4">Showing 10 of {rows.length}</p>}
            <p className="narrative mt-8">
              Score = commits × 5 + pull requests × 20 + roadmap nodes × 30 + projects × 25.
              It rewards consistency and shipped work — never streak anxiety. Climb it by building, not by gaming it.
            </p>
          </>
        )}
      </main>
    </AppShell>
  );
}
