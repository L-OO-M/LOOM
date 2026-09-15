import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";

// Private workspace — never indexed.
export const metadata = {
  robots: { index: false, follow: false }
};

export default async function LeadLayout({ children }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/lead");
  if (ctx.error) redirect("/login?redirect=/lead");
  if (!["dept_lead", "vertical_lead", "admin"].includes(ctx.profile.role)) redirect("/student");
  return <>{children}</>;
}
