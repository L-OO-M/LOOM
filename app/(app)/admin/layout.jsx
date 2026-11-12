import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import "../../../components/loom/workspace.css";
import "./_components/admin-console.css";

// Private workspace — never indexed.
export const metadata = {
  robots: { index: false, follow: false }
};

export default async function AdminLayout({ children }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin");
  if (ctx.error === "CONSENT_REQUIRED") redirect("/consent");
  if (ctx.error === "ACCOUNT_SUSPENDED") redirect("/account-status?state=suspended");
  if (ctx.error === "ACCOUNT_DEACTIVATED") redirect("/account-status?state=deactivated");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error === "PROFILE_NOT_FOUND") redirect("/login?redirect=/admin");
  return <>{children}</>;
}
