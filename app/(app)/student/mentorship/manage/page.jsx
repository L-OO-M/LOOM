import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Meta, Display } from "@/components/loom/primitives";
import { ManageClient } from "./_components/ManageClient";

export default async function MentorManagePage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/mentorship/manage");
  const { tenant, user, sql } = ctx;
  const [mentor] = await sql`SELECT user_id FROM mentors WHERE user_id = ${user.id} LIMIT 1`;
  if (!mentor) redirect("/student/mentorship");
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <nav aria-label="Breadcrumb" className="meta flex items-center gap-1.5">
          <Link href="/student/mentorship" prefetch={false} className="hover:underline">Mentors</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" style={{ color: "var(--text)" }}>Dashboard</span>
        </nav>
        <Display size="lg" className="mt-3">Mentor Dashboard</Display>
        <p className="narrative mt-2">Requests, sessions, availability, profile, and messages — your practice in one place.</p>
        <div className="mt-6">
          <ManageClient />
        </div>
      </main>
    </AppShell>
  );
}
