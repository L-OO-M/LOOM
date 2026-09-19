import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, StatusPill } from "@/components/loom/primitives";
import { Reveal } from "@/components/motion/Reveal";
import ContestDetailClient from "./ContestDetailClient";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = new Set(["published", "active", "open"]);

function humanStatus(status) {
  if (OPEN_STATUSES.has(status)) return { label: "Open", tone: "live" };
  if (status === "upcoming") return { label: "Announced", tone: "" };
  return { label: "Closed", tone: "" };
}

function dateRange(c) {
  const fmt = (v) => new Date(v).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  if (c.starts_at && c.ends_at) return `${fmt(c.starts_at)} → ${fmt(c.ends_at)}`;
  if (c.starts_at) return `Starts ${fmt(c.starts_at)}`;
  if (c.ends_at) return `Entries close ${fmt(c.ends_at)}`;
  return "Dates to be announced";
}

export default async function ContestDetailPage({ params }) {
  const { id } = await params;
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=/student/contests/${id}`);
  const { user, tenant, sql } = ctx;
  const [contest] = await sql`
    SELECT c.*,
      (SELECT COUNT(*)::int FROM contest_registrations r WHERE r.contest_id = c.id) AS registrations
    FROM contests c WHERE c.id = ${id} LIMIT 1
  `;
  if (!contest) notFound();
  if (tenant?.id && contest.tenant_id && contest.tenant_id !== tenant.id) redirect("/student/contests");
  // Drafts are admin working state — students never see them here either.
  if (contest.status === "draft") redirect("/student/contests");
  const [reg] = await sql`SELECT id FROM contest_registrations WHERE contest_id = ${id} AND student_id = ${user.id} LIMIT 1`;
  const submissions = await sql`SELECT * FROM contest_submissions WHERE contest_id = ${id} AND student_id = ${user.id} ORDER BY created_at DESC LIMIT 10`;

  const hs = humanStatus(contest.status);
  const registered = !!reg;
  const shipped = submissions.length;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/student/contests" prefetch={false} className="meta hover:underline" style={{ color: "var(--accent)" }}>← Challenges</Link>
        <Reveal>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusPill tone={hs.tone}>{hs.label}</StatusPill>
            <span className="meta">{dateRange(contest)}</span>
            {registered && <StatusPill tone="live">you&apos;re registered</StatusPill>}
            {shipped > 0 && <StatusPill tone="">{shipped === 1 ? "1 entry shipped" : `${shipped} entries shipped`}</StatusPill>}
          </div>
          <Display size="lg" className="mt-3">{contest.title}</Display>
          <p className="lede mt-4">{contest.description || "Details are being finalized — register now and they will land in your inbox."}</p>
          {typeof contest.registrations === "number" && contest.registrations > 0 && (
            <p className="meta mt-3">{contest.registrations} registered</p>
          )}
        </Reveal>
        <div className="mt-8">
          <ContestDetailClient contest={contest} registered={registered} submissions={submissions} />
        </div>
        <section className="mt-12 border-t pt-8" style={{ borderColor: "var(--line)" }} aria-label="What this can become">
          <Meta>What this can become</Meta>
          <h2 className="h-product mt-2">From entry to proof.</h2>
          <p className="narrative mt-3">
            Challenges are part of the proving journey. Strong challenge work can become part of
            your signed proof when your chapter recognizes it —{" "}
            <Link href="/student/credentials" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
              see your proof →
            </Link>
          </p>
        </section>
      </main>
    </AppShell>
  );
}
