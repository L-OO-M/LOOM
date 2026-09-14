import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import SettingsClient from "../settings/SettingsClient";

export default async function OnboardingPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/onboarding");
  const { tenant, user, profile } = ctx;
  if (profile?.onboarding_completed) redirect("/student");
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-2xl px-4 sm:px-6">
        <Meta>Begin · one step</Meta>
        <Display size="lg" className="mt-3">Welcome, {profile?.name || "builder"}.</Display>
        <p className="narrative mt-4" style={{ color: "var(--text)" }}>
          Tell us where you're pointed. This assigns your college workspace, aims your recommendations, and unlocks the roadmap.
        </p>

        <section className="mt-8 border-y py-6" style={{ borderColor: "var(--line)" }} aria-label="Your direction">
          <SettingsClient profile={profile} />
        </section>

        <Timeline className="mt-8">
          <TimelineItem state="now" title="Set your direction" body="You're doing it now — save your profile below." />
          <TimelineItem state="todo" title="Walk the first node" body="Your roadmap opens the moment onboarding completes." />
          <TimelineItem state="todo" title="Connect GitHub" body="Commits become evidence without any extra effort." />
        </Timeline>

        <p className="meta mt-8">College · {tenant?.name || "—"} — saving marks onboarding complete.</p>
      </main>
    </AppShell>
  );
}
