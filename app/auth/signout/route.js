import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Sign out of BOTH identity providers.
//
// Supabase's session is cleared here; the Auth0 SDK's /auth/logout route clears
// the Auth0 session cookie (and is a harmless redirect when there was none).
// Every sign-out form in the app -- AppShell, the landing header, student
// settings -- posts here, so this is the single place that has to know that two
// providers exist.
export async function POST(request) {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/auth/logout", request.url));
}
