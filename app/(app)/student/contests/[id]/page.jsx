import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";
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
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}><Link href="/student/contests" style={{ color: "var(--accent)" }}>← Contests</Link></p>
        <PageHeader kicker={contest.status} title={contest.title} desc={contest.description || "No description"} />
        <Card>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {contest.starts_at ? `Starts ${new Date(contest.starts_at).toLocaleString("en-IN")}` : "Start TBD"}
            {contest.ends_at ? ` · Ends ${new Date(contest.ends_at).toLocaleString("en-IN")}` : ""}
          </p>
        </Card>
        <div className="mt-4">
          <ContestDetailClient contest={contest} registered={!!reg} submissions={submissions} />
        </div>
      </main>
    </AppShell>
  );
}
