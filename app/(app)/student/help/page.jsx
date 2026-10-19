import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";
import { Display, StatusPill } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";
import { HelpHelperToggle } from "./_components/HelpHelperToggle";
import { FindHelpersButton } from "./_components/FindHelpersButton";
import { MatchDecision } from "./_components/MatchDecision";

export const dynamic = "force-dynamic";

const KIND_LABEL = {
  roadmap_node: "Roadmap node",
  resource: "Resource",
  contest: "Contest",
  topic: "Topic"
};

const STATUS_TONE = { open: "warn", matched: "info", resolved: "ok", closed: "" };
const STATUS_LABEL = {
  open: "Looking for help",
  matched: "Matching",
  resolved: "Resolved",
  closed: "Closed"
};

function fmtWhen(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" });
}

// This page exists because the entire help feature was built and then
// unreachable. Migration 028 created help_signals / helper_profiles /
// help_matches, lib/recommend.js implemented matching, and four permission-
// checked API routes were written -- but nothing in the UI called them, and two
// notifications linked to /student/help, which did not exist and 404'd. A
// student stuck on a roadmap node had no way to say so.
//
// Reads go straight to the DB (house pattern for server components, AGENTS.md
// 3.2). Writes go through the existing /api/help/* routes, which are the only
// audited, rate-limited, tenant-scoped path for changing help state.
export default async function HelpPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/help");
  const { user, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;

  const signals = tid
    ? await sql`
        SELECT s.id, s.kind, s.ref_id, s.status, s.failures_count, s.updated_at,
          (SELECT COUNT(*)::int FROM help_matches m
            WHERE m.signal_id = s.id AND m.status = 'pending') AS pending_matches
        FROM help_signals s
        WHERE s.user_id = ${user.id} AND s.tenant_id = ${tid}::uuid
        ORDER BY s.updated_at DESC
        LIMIT 20`
    : [];

  // Matches addressed to me as a helper. This is the other half of the loop:
  // the requester nominates helpers, and the helper decides here.
  const myMatches = tid
    ? await sql`
        SELECT m.id, m.status, m.created_at, s.kind, s.ref_id
        FROM help_matches m
        JOIN help_signals s ON s.id = m.signal_id
        WHERE m.helper_id = ${user.id} AND m.tenant_id = ${tid}::uuid
        ORDER BY m.created_at DESC
        LIMIT 20`
    : [];

  const [me] = await sql`
    SELECT user_id, available, topics, last_active_at
    FROM helper_profiles WHERE user_id = ${user.id} LIMIT 1`;
  const available = !!me?.available;

  const pendingForMe = myMatches.filter((m) => m.status === "pending");

  return (
    <AppShell area="student" tenant={tenant} user={ctx.profile}>
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6">
        <PageHeader
          kicker="Connect · peer help"
          title="Stuck on something?"
          desc="Raise it once, and the chapter's available helpers get notified. No chasing, no cold DMs."
        />

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-10">
            <section aria-labelledby="my-requests">
              <h2 id="my-requests" className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>
                Your requests
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                Raised from a roadmap node, resource or contest page.
              </p>

              <div className="mt-4 space-y-3">
                {signals.length === 0 ? (
                  <OnboardingState
                    eyebrow="All clear"
                    title="Nothing outstanding"
                    why="If a roadmap node or resource stalls you, raise it from that page and it appears here with the helpers it reached."
                  />
                ) : (
                  signals.map((s) => (
                    <Card key={s.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
                            {KIND_LABEL[s.kind] || s.kind}
                          </span>
                          <StatusPill tone={STATUS_TONE[s.status] || ""}>
                            {STATUS_LABEL[s.status] || s.status}
                          </StatusPill>
                        </div>
                        <span className="meta mt-0.5 block truncate">{s.ref_id}</span>
                        <span className="meta mt-0.5 block">
                          Raised {fmtWhen(s.updated_at)}
                          {s.failures_count > 1 ? ` · ${s.failures_count} attempts` : ""}
                        </span>
                      </div>
                      <FindHelpersButton signalId={s.id} pending={s.pending_matches > 0} />
                    </Card>
                  ))
                )}
              </div>
            </section>

            <section aria-labelledby="my-matches">
              <h2 id="my-matches" className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>
                Requests for you
                {pendingForMe.length > 0 && (
                  <span className="ml-2 align-middle text-sm font-normal" style={{ color: "var(--accent)" }}>
                    {pendingForMe.length} awaiting your answer
                  </span>
                )}
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                A member is blocked on something. You see what — never who.
              </p>

              <div className="mt-4 space-y-3">
                {myMatches.length === 0 ? (
                  <OnboardingState
                    eyebrow="Inbox clear"
                    title="No one is waiting on you"
                    why="When a member nominates you as a helper, the request lands here to accept or decline."
                  />
                ) : (
                  myMatches.map((m) => (
                    <Card key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
                          {KIND_LABEL[m.kind] || m.kind}
                        </span>
                        <span className="meta mt-0.5 block truncate">{m.ref_id}</span>
                        <span className="meta mt-0.5 block">Nominated {fmtWhen(m.created_at)}</span>
                      </div>
                      {m.status === "pending" ? (
                        <MatchDecision matchId={m.id} />
                      ) : (
                        <StatusPill tone={m.status === "accepted" ? "ok" : ""}>{m.status}</StatusPill>
                      )}
                    </Card>
                  ))
                )}
              </div>
            </section>
          </div>

          <aside aria-labelledby="helper-panel">
            <div className="lg:sticky lg:top-24">
              <Card className="p-5">
                <Display className="text-lg">Help others</Display>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                  {available
                    ? "You are listed as a helper. Members can nominate you when they are stuck."
                    : "Opt in and members can nominate you when they hit a wall. You can turn this off at any time."}
                </p>

                <div className="mt-4">
                  <HelpHelperToggle available={available} topics={me?.topics || []} />
                </div>

                <p className="meta mt-4">
                  {available
                    ? "Opted in as a helper."
                    : "Not opted in, so you cannot be nominated."}
                </p>
              </Card>
            </div>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}