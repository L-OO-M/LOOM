import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getRequestContext } from "@/lib/auth-server";

// Private workspace — never indexed.
export const metadata = {
  robots: { index: false, follow: false }
};

// Layout fetches auth once per request; pages reuse the same cache()
// instance so revisit via Router Cache + staleTimes avoids re-hitting DB.
// User progress (resource_progress, student_roadmap_progress) stays 10s stale
// with revalidateTag on mutations (see lib/server-cache.js).
export default async function StudentLayout({ children }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/student");
  if (ctx.error === "PROFILE_NOT_FOUND") redirect("/login?redirect=/student");

  // First-run gate: a student who has not finished onboarding has no domain, no
  // aimed recommendations and no meaningful roadmap, so any student page they
  // reach is a dead end. Send them to onboarding — but not from onboarding
  // itself, which would loop, and never for staff (leads/admins use this area
  // too and complete onboarding through their own flow). Path comes from the
  // x-pathname request header set in middleware.
  const { profile } = ctx;
  if (profile?.role === "student" && !profile.onboarding_completed) {
    const pathname = (await headers()).get("x-pathname") || "";
    if (pathname !== "/student/onboarding") {
      redirect("/student/onboarding");
    }
  }
  return <>{children}</>;
}
