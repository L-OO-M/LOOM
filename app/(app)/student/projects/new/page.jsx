import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";
import NewProjectForm from "./NewProjectForm";

export default async function NewProjectPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/projects/new");
  const { tenant, user, sql } = ctx;
  const milestones = await sql`SELECT id, title FROM roadmap_nodes ORDER BY sort_order ASC LIMIT 100`;
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/student/projects" prefetch={false} style={{ color: "var(--accent)" }}>← Projects</Link>
        </p>
        <Meta className="mt-4">Create · name the work</Meta>
        <Display size="lg" className="mt-3">Start a new project.</Display>
        <p className="narrative mt-4" style={{ color: "var(--text)" }}>
          Small and real beats big and planned. You can link the repository and the roadmap milestone now — or later.
        </p>
        <NewProjectForm milestones={milestones} />
      </main>
    </AppShell>
  );
}
