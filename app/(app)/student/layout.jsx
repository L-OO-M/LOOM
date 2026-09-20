import { redirect } from "next/navigation";
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
  return <>{children}</>;
}
