import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Meta } from "@/components/loom/primitives";
import { WorkspaceMasthead } from "@/components/loom/WorkspaceMasthead";
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
  if (!tenant?.id) redirect("/student/contests");
  // Scope in SQL, not after the read: a null on either side used to skip the
  // comparison and render another chapter's contest (and its registration count).
  const [contest] = await sql`
    SELECT c.*,
      (SELECT COUNT(*)::int FROM contest_registrations r WHERE r.contest_id = c.id) AS registrations
    FROM contests c
    WHERE c.id = ${id}
      AND c.tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!contest) notFound();
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
        <WorkspaceMasthead
          kicker={`${hs.label} / ${contest.ends_at ? new Date(contest.ends_at).toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" }) : "date to be announced"}`}
          title={contest.title}
          lede={contest.description || "Details are being finalized — register now and they will land in your inbox."}
          meta={`${dateRange(contest)}${typeof contest.registrations === "number" && contest.registrations > 0 ? ` / ${contest.registrations} registered` : ""}`}
          tone="ledger"
          art="/events/event-contest.png"
          artAlt=""
          stats={[
            { value: contest.registrations ?? 0, label: "registered" },
            { value: shipped, label: "your entries" }
          ]}
        >
          <div className="wsm-actions">
            {registered && <span className="pill is-live">You&apos;re registered ✓</span>}
            {shipped > 0 && <span className="pill">{shipped === 1 ? "1 entry shipped" : `${shipped} entries shipped`}</span>}
            {!registered && hs.label === "Open" && <span className="pill is-gold">Registration open</span>}
          </div>
        </WorkspaceMasthead>
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
