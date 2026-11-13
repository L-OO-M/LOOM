import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Meta } from "@/components/loom/primitives";
import { WorkspaceEmpty, WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { DebugReviewCard } from "@/components/debug/DebugReviewCard";
import { loadDebugQueue, reviewScopes } from "@/lib/debug";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false }
};

export default async function LeadDebugPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/lead/debug");
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/student");

  const scope = reviewScopes(profile);
  if (!scope.all && scope.domains.length === 0) redirect("/lead/overview");

  const queue = await loadDebugQueue(sql, tenant.id, { domains: scope.domains, all: scope.all });
  const approved = await loadDebugQueue(sql, tenant.id, {
    domains: scope.domains,
    all: scope.all,
    statuses: ["approved"]
  });
  const domains = scope.all ? ["every domain"] : scope.domains;

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker="Programs / debug review"
          title="Debug queue"
          lede="Verified forks from your domain. Check the fix against the brief, then approve it or return it with clear feedback."
          meta={`${queue.length} waiting / ${domains.join(", ")}`}
          stats={[
            { value: queue.length, label: "waiting for review" },
            { value: scope.all ? "all" : scope.domains.length, label: "domains in scope" },
            { value: queue.filter((item) => item.prUrl).length, label: "with pull requests" },
            { value: queue.filter((item) => item.verificationStatus === "error").length, label: "check errors" }
          ]}
        />

        <WorkspaceSection
          index="01"
          title="Waiting for a human"
          note="Automated checks run before a submission reaches this queue. You cannot review your own work."
        >
          {queue.length === 0 ? (
            <WorkspaceEmpty
              title="No submissions waiting."
              body="When a member in your scope submits a verified fork, it appears here."
            />
          ) : (
            <ul className="mt-4 grid gap-3">
              {queue.map((submission) => (
                <DebugReviewCard key={submission.id} submission={submission} />
              ))}
            </ul>
          )}
          <Meta>
            Approval records debug evidence in the member&apos;s chapter standing. Returning a submission does not penalise them; it asks for another attempt.
          </Meta>
        </WorkspaceSection>

        <WorkspaceSection
          index="02"
          title="Approved in your domain"
          note="If a fix was approved by mistake, return it here. The debug point is removed and the history stays audited."
        >
          {approved.length === 0 ? (
            <WorkspaceEmpty
              title="No approved fixes in your scope."
              body="Approved challenges appear here so a domain lead can reverse a decision without asking an admin."
            />
          ) : (
            <ul className="mt-4 grid gap-3">
              {approved.map((submission) => (
                <DebugReviewCard key={submission.id} submission={submission} />
              ))}
            </ul>
          )}
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
