import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, StatusPill } from "@/components/loom/primitives";
import ContestDetailClient from "./ContestDetailClient";

export default async function ContestDetailPage({ params }) {
  const { id } = await params;
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=/student/contests/${id}`);
  const { user, tenant, sql } = ctx;
  const [contest] = await sql`SELECT * FROM contests WHERE id = ${id} LIMIT 1`;
  if (!contest) notFound();
  if (tenant?.id && contest.tenant_id && contest.tenant_id !== tenant.id) redirect("/student/contests");
  const [reg] = await sql`SELECT id FROM contest_registrations WHERE contest_id = ${id} AND student_id = ${user.id} LIMIT 1`;
  const submissions = await sql`SELECT * FROM contest_submissions WHERE contest_id = ${id} AND student_id = ${user.id} ORDER BY created_at DESC LIMIT 10`;
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/student/contests" className="meta hover:underline" style={{ color: "var(--accent)" }}>← Challenges</Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusPill tone={contest.status === "open" || contest.status === "published" ? "live" : ""}>{contest.status}</StatusPill>
          <span className="meta">
            {contest.starts_at ? `starts ${new Date(contest.starts_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "start TBD"}
            {contest.ends_at ? ` · ends ${new Date(contest.ends_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
          </span>
          {reg && <StatusPill tone="live">you're in</StatusPill>}
        </div>
        <Display size="lg" className="mt-3">{contest.title}</Display>
        <p className="lede mt-4">{contest.description || "Details are being finalized — register now and they will land in your inbox."}</p>
        <div className="mt-8">
          <ContestDetailClient contest={contest} registered={!!reg} submissions={submissions} />
        </div>
      </main>
    </AppShell>
  );
}
