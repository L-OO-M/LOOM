import { createServerSupabase } from "@/lib/supabase/server";
import { auth0 } from "@/lib/auth0";
import { NextResponse } from "next/server";

// Sign out of Auth0, and clear any legacy Supabase cookie.
//
// Auth0 is the only identity provider, so /auth/logout is the real sign-out:
// it clears the Auth0 session cookie and ends the upstream session. The Supabase
// call remains purely as cookie hygiene for browsers that still hold a cookie
// from the retired flow; it cannot authenticate anything now.
//
// Every sign-out form in the app -- AppShell, the landing header, student
// settings -- posts here. If Auth0 is unconfigured there is nothing to sign out
// of, so the visitor goes to the public home page instead of a route the SDK
// does not own.
export async function POST(request) {
  const supabase = await createServerSupabase();
  try {
    await supabase.auth.signOut();
  } catch {
    // A missing Supabase session is a no-op, not a failed sign-out.
  }
  // 303, not the default 307: the SDK's /auth/logout only answers GET, and a
  // 307 would replay this POST there and land on the 404 page.
  return NextResponse.redirect(new URL(auth0 ? "/auth/logout" : "/", request.url), 303);
}
