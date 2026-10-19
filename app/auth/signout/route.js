import { createServerSupabase } from "@/lib/supabase/server";
import { auth0 } from "@/lib/auth0";
import { NextResponse } from "next/server";

// Sign out of BOTH identity providers.
//
// Supabase's session is cleared here. When Auth0 is configured, the browser is
// then sent to the Auth0 SDK's /auth/logout, which clears the Auth0 session
// cookie and ends the upstream session. Without Auth0 there is nothing left to
// clear, so send the visitor to the public home page rather than to /auth/logout
// -- which, unconfigured, is not owned by the SDK and would be gated by the
// middleware.
//
// Every sign-out form in the app -- AppShell, the landing header, student
// settings -- posts here, so this is the single place that has to know that two
// providers exist.
export async function POST(request) {
  const supabase = await createServerSupabase();
  try {
    await supabase.auth.signOut();
  } catch {
    // A missing Supabase session is a no-op, not a failed sign-out.
  }
  return NextResponse.redirect(new URL(auth0 ? "/auth/logout" : "/", request.url));
}
