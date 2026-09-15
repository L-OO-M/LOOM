import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { HandoverBoard } from "@/app/(app)/admin/handover/_components/HandoverBoard";

export default async function AdminHandoverPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/handover");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/handover");
  const { user, tenant } = ctx;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Continuity" title="Handover" desc="What the outgoing committee transfers: documents, contacts, ongoing projects. Check items off as they move — nothing tenure-critical lives in someone's head." />
        <section className="mt-8" aria-label="Checklist">
          <Meta>Transfer checklist</Meta>
          <div className="mt-3">
            <HandoverBoard />
          </div>
        </section>
      </main>
    </AppShell>
  );
}
