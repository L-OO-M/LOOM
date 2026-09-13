import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import NewProjectForm from "./NewProjectForm";

export default async function NewProjectPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/projects/new");
  const { tenant, user } = ctx;
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}><Link href="/student/projects" style={{ color: "var(--accent)" }}>← Projects</Link></p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>New project</h1>
        <NewProjectForm />
      </main>
    </AppShell>
  );
}
