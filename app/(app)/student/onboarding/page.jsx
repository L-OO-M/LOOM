import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import { loadDomainCatalogue } from "@/lib/roadmap";
import OnboardingForm from "./_components/OnboardingForm";

export default async function OnboardingPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/onboarding");
  const { tenant, user, profile, sql } = ctx;
  if (profile?.onboarding_completed) redirect("/student");

  // Only tracks that actually have roadmap content become options. Showing a
  // track with zero nodes would let a member pick their way into an empty map.
  const domains = await loadDomainCatalogue(sql);

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Onboarding / ${tenant?.name || "your college"}`}
          title={`Welcome, ${profile?.name?.split(" ")[0] || "builder"}.`}
          lede="Three decisions and you're in: the track you want to start on, the name your work will be filed under, and how you sign in next time. Everything here can change later."
          meta="Four sections · about two minutes"
          tone="paper"
          art="/storyloom/learning.png"
          artAlt=""
        />

        <div className="mt-8">
          <OnboardingForm profile={profile} domains={domains} requireUsername finishHref="/student" />
        </div>

        <WorkspaceSection index="05" title="What happens next" note="The first step is the one you are on.">
          <Timeline className="mt-4">
            <TimelineItem state="now" title="Set your direction" body="Pick a track and save — you're doing it now." />
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
