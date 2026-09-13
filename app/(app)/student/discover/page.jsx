import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";
import { reputationFor } from "@/lib/reputation";
import { ClaimCard, MentorReviewForm } from "./DiscoverBits";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/discover");
  const { user, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;

  const [myCard] = await sql`SELECT username FROM user_profiles WHERE user_id = ${user.id} LIMIT 1`;
  const threads = await sql`
    SELECT t.id, t.title, t.upvote_count, t.reply_count, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.tenant_id = ${tid}::uuid AND t.status = 'visible' AND t.created_at >= now() - interval '7 days'
    ORDER BY t.upvote_count DESC LIMIT 5
  `;
  const mentors = await sql`
    SELECT m.user_id, m.expertise, p.name, COUNT(r.id)::int AS reviews,
      COALESCE(AVG(r.rating),0)::numeric AS avg_rating
    FROM mentors m
    LEFT JOIN profiles p ON p.user_id = m.user_id
    LEFT JOIN mentor_reviews r ON r.mentor_id = m.user_id
    WHERE m.tenant_id = ${tid}::uuid AND m.available = true
    GROUP BY m.user_id, m.expertise, p.name ORDER BY avg_rating DESC, reviews DESC LIMIT 5
  `;
  const students = await sql`SELECT up.username, up.user_id, p.name FROM user_profiles up JOIN profiles p ON p.user_id = up.user_id WHERE up.tenant_id = ${tid}::uuid AND up.is_public = true AND up.user_id <> ${user.id} LIMIT 20`;
  const rising = [];
  for (const s of students) {
    const rep = await reputationFor(sql, s.user_id).catch(() => ({ score: 0 }));
    if (rep.score > 0) rising.push({ ...s, score: rep.score });
  }
  rising.sort((a, b) => b.score - a.score);

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="People" title="Discover" desc="Trending discussions, rising builders, and mentors worth your time." />
        <ClaimCard hasCard={!!myCard} />

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Trending this week</h2>
            {threads.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Quiet week. <Link href="/student/community/forums" style={{ color: "var(--accent)" }}>Start a thread →</Link></p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {threads.map((t) => (
                  <li key={t.id}>
                    <Link href={`/student/community/forums/${t.id}`} className="hover:underline" style={{ color: "var(--text)" }}>{t.title}</Link>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>▲{t.upvote_count} · {t.reply_count} replies · {t.author_name || "a student"}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Rising builders</h2>
            {rising.slice(0, 5).length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No public profiles with reputation yet. Earn proof and claim your card.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {rising.slice(0, 5).map((s) => (
                  <li key={s.user_id} className="flex justify-between gap-2">
                    <Link href={`/student/${s.username}`} className="hover:underline" style={{ color: "var(--text)" }}>{s.name} <span style={{ color: "var(--text-muted)" }}>@{s.username}</span></Link>
                    <span className="font-mono" style={{ color: "var(--accent)" }}>{s.score}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Mentors</h2>
            {mentors.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No available mentors. <Link href="/student/mentorship" style={{ color: "var(--accent)" }}>Browse mentorship →</Link></p>
            ) : (
              <ul className="mt-3 space-y-4 text-sm">
                {mentors.map((m) => (
                  <li key={m.user_id}>
                    <p style={{ color: "var(--text)" }}>{m.name || "Mentor"} <span style={{ color: "var(--text-muted)" }}>· {m.expertise || "general"}</span></p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {Number(m.reviews) > 0 ? `★${Number(m.avg_rating).toFixed(1)} (${m.reviews} reviews)` : "No reviews yet"}
                    </p>
                    <MentorReviewForm mentorId={m.user_id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
