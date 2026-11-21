import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import "../../../components/loom/workspace.css";
import "./_components/lead-console.css";

// Private workspace — never indexed.
export const metadata = {
  robots: { index: false, follow: false }
};

export default async function LeadLayout({ children }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/lead");
  if (ctx.error === "CONSENT_REQUIRED") redirect("/consent");
  if (ctx.error === "ACCOUNT_SUSPENDED") redirect("/account-status?state=suspended");
  if (ctx.error === "ACCOUNT_DEACTIVATED") redirect("/account-status?state=deactivated");
  if (ctx.error) redirect("/login?redirect=/lead");
  const subject = {
    id: ctx.user.id,
    tenantId: ctx.tenant.id,
    role: ctx.profile.role,
    vertical: ctx.profile.vertical || null,
    memberships: ctx.profile.memberships || [],
    scopedGrants: ctx.profile.scopedGrants || [],
    roleTermEnd: ctx.profile.roleTermEnd ?? ctx.profile.role_term_end ?? null,
    isPlatformAdmin: !!ctx.profile.isPlatformAdmin
  };
  if (!can(subject, "manage_handover").ok) redirect("/student");
  return <>{children}</>;
}
