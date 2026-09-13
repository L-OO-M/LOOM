import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";
import SettingsClient from "../settings/SettingsClient";

export default async function OnboardingPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/onboarding");
  const { tenant, user, profile } = ctx;
  if (profile?.onboarding_completed) redirect("/student");
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Step 1 of 1" title={`Welcome, ${profile?.name || "builder"}`} desc="Complete your profile to finish onboarding. This assigns your college workspace and unlocks the roadmap." />
        <SettingsClient profile={profile} />
        <div className="mt-4">
          <Card><p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>College: {tenant?.name} · Saving marks onboarding complete and returns you to the dashboard on next visit.</p></Card>
        </div>
      </main>
    </AppShell>
  );
}
