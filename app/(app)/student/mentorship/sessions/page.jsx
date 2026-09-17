import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Meta, Display } from "@/components/loom/primitives";
import { SessionsClient } from "./_components/SessionsClient";

export default async function MySessionsPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/mentorship/sessions");
  const { tenant, user } = ctx;
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <nav aria-label="Breadcrumb" className="meta flex items-center gap-1.5">
          <Link href="/student/mentorship" prefetch={false} className="hover:underline">Mentors</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" style={{ color: "var(--text)" }}>My Sessions</span>
        </nav>
        <Display size="lg" className="mt-3">My Sessions</Display>
        <p className="narrative mt-2">Upcoming, completed, and cancelled mentoring — join, reschedule, or review.</p>
        <div className="mt-6">
          <SessionsClient />
        </div>
      </main>
    </AppShell>
  );
}
