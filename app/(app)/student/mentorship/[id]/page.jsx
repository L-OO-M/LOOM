import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Star } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { enrichMentors, availabilityMap } from "@/lib/mentors";
import { AppShell } from "@/components/AppShell";
import { Meta } from "@/components/loom/primitives";
import { ProfileClient } from "./_components/ProfileClient";

function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default async function MentorProfilePage({ params }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/mentorship");
  const { user, tenant, sql } = ctx;
  const { id } = await params;

  const [row] = await sql`
    SELECT m.*, p.name AS mentor_name, p.branch, p.year
    FROM mentors m LEFT JOIN profiles p ON p.user_id = m.user_id
    WHERE (m.user_id = ${id} OR m.id::text = ${id})
      AND (m.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    LIMIT 1
  `;
  if (!row) notFound();
  const [mentor] = await enrichMentors(sql, [row]);
  const availability = await availabilityMap(sql, [mentor.user_id]);
  const reviews = await sql`
    SELECT r.*, p.name AS reviewer_name FROM mentor_reviews r
    LEFT JOIN profiles p ON p.user_id = r.reviewer_id
    WHERE r.mentor_id = ${mentor.user_id}
    ORDER BY r.reviewed_at DESC LIMIT 20
  `;
  const [completed] = await sql`
    SELECT id FROM mentor_sessions
    WHERE mentor_id = ${mentor.user_id} AND student_id = ${user.id} AND status = 'completed'
    LIMIT 1
  `;
  const isSelf = user.id === mentor.user_id;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <nav aria-label="Breadcrumb" className="meta flex items-center gap-1.5">
          <Link href="/student/mentorship" prefetch={false} className="hover:underline">Mentors</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" style={{ color: "var(--text)" }}>{mentor.mentor_name || "Mentor"}</span>
        </nav>

        <div className="mt-4 flex items-start gap-4">
          <span className="relative grid size-16 shrink-0 place-items-center rounded-full text-lg font-bold text-white" style={{ background: "var(--dash-accent, var(--accent))" }} aria-hidden="true">
            {initials(mentor.mentor_name)}
            <span
              className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full border-2"
              style={{ background: mentor.available ? "#22c55e" : "var(--text-muted)", borderColor: "var(--bg)" }}
              title={mentor.available ? "Available" : "Paused"}
            />
          </span>
          <div className="min-w-0">
            <h1 className="display display-md">{mentor.mentor_name || "Mentor"}</h1>
            <p className="mt-1 text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              {mentor.headline || mentor.expertise || "General guidance"}
            </p>
            <p className="meta mt-1.5 flex flex-wrap items-center gap-2">
              {Number(mentor.review_count) > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Star size={12} fill="var(--accent)" strokeWidth={0} aria-hidden="true" />
                  {Number(mentor.avg_rating).toFixed(1)} · {mentor.review_count} review{mentor.review_count === 1 ? "" : "s"}
                </span>
              ) : <span>New mentor</span>}
              {mentor.experience_years != null && <span>· {mentor.experience_years} yrs</span>}
              {mentor.is_verified && <span style={{ color: "var(--accent)" }}>· Verified</span>}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <ProfileClient
            mentor={mentor}
            availability={availability[mentor.user_id] || []}
            reviews={reviews}
            canReview={!!completed}
            isSelf={isSelf}
          />
        </div>

        {!completed && !isSelf && (
          <Meta className="mt-6">Reviews open after your first completed session with this mentor.</Meta>
        )}
      </main>
    </AppShell>
  );
}
