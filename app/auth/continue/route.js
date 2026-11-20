import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth-server";
import { homeForRole } from "@/lib/auth";

// The landing pad for a completed sign-in.
//
// Auth0 finishes the OAuth exchange inside the middleware and then redirects to
// `returnTo`. Without an explicit returnTo the SDK falls back to the site root,
// which is the public marketing page -- so a member who had just successfully
// authenticated arrived somewhere that looks signed-out and had to guess their
// way to /student. The Supabase form never had this problem because it pushed a
// client-side destination after `signIn()`. This route is that destination,
// expressed server-side so both front doors behave the same.
//
// Every branch here must terminate in a redirect. A 200 would leave the member
// staring at a blank page in the middle of a login.
export const dynamic = "force-dynamic";

function to(path) {
  // A RELATIVE Location, deliberately not an absolute URL built from
  // request.url / NEXT_PUBLIC_APP_URL. Chapters are first-class hosts here
  // (tenant_domains), so an absolute redirect pinned to the app URL would move a
  // member off their own chapter domain -- and out of their tenant -- in the
  // middle of a login. A relative Location resolves against the request URI, so
  // whatever host the member signed in on is the host they stay on.
  //
  // 303 rather than the default 307: this runs after a GET, and a permanent
  // method-preserving redirect would let a client re-POST the auth callback.
  return new NextResponse(null, { status: 303, headers: { location: path } });
}

export async function GET() {
  const ctx = await getRequestContext();

  if (!ctx.user || ctx.error === "UNAUTHORIZED") return to("/login");

  // Consent is recorded once per policy version and is required before any
  // write. A brand-new Auth0 identity has no Supabase signup step to capture it.
  if (ctx.error === "CONSENT_REQUIRED") return to("/consent");

  if (ctx.error === "ACCOUNT_SUSPENDED") return to("/account-status?state=suspended");
  if (ctx.error === "ACCOUNT_DEACTIVATED") return to("/account-status?state=deactivated");

  // A profile that exists but cannot be placed in a chapter is a half-provisioned
  // account. Sending it onward would serve widened tenant queries, so it goes
  // back to the front door rather than into the workspace -- with a reason, so
  // the member is not silently bounced back to a login screen that looks like it
  // simply did not work.
  if (ctx.error === "PROFILE_NOT_FOUND" || ctx.error === "TENANT_UNRESOLVED") {
    return to("/login?error=account_unresolved");
  }

  // Any error code not named above is still an error. Falling through to a role
  // home would send a half-resolved context into the workspace, where the layout
  // would bounce it straight back here -- a redirect loop with a login in it.
  if (ctx.error) return to("/login");

  // effectiveRole, not the stored role: a platform admin/founder is governed as
  // an admin even when profiles.role still reads "student". Using the stored
  // value sent a founder to the student home right after sign-in.
  const role = ctx.profile?.effectiveRole || ctx.profile?.role;
  if (role === "student" && !ctx.profile?.onboarding_completed) {
    return to("/student/onboarding");
  }

  return to(homeForRole(role));
}
