import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
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
        <WorkspaceMasthead
          kicker="Onboarding / one step"
          title={`Welcome, ${profile?.name || "builder"}.`}
          lede="Tell us where you're pointed, claim your public handle, and add a password if you want one. This assigns your college workspace, aims your recommendations, and unlocks the roadmap."
          meta={`College / ${tenant?.name || "—"}`}
          tone="paper"
          art="/storyloom/learning.png"
          artAlt=""
        />

        <WorkspaceSection index="01" title="Your direction" note="Save your profile to complete onboarding.">
          <div className="pt-4">
            <SettingsClient profile={profile} requireUsername />
          </div>
        </WorkspaceSection>

        <WorkspaceSection index="02" title="What happens next" note="The first step is the one you are on.">
          <Timeline className="mt-4">
            <TimelineItem state="now" title="Set your direction" body="You're doing it now — save your profile below." />
            <TimelineItem state="todo" title="Claim your handle" body="Your public profile and builder card use this handle." />
            <TimelineItem state="todo" title="Walk the first node" body="Your roadmap opens the moment onboarding completes." />
            <TimelineItem state="todo" title="Connect GitHub" body="Commits become evidence without any extra effort." />
          </Timeline>
        </WorkspaceSection>

        <p className="meta mt-8">Saving marks onboarding complete for {tenant?.name || "your college"}.</p>
      </main>
    </AppShell>
  );
}
