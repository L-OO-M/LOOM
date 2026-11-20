import { NextResponse } from "next/server";

// Tombstone for the retired Supabase OAuth callback.
//
// /auth/callback belonged to Supabase before Auth0 claimed it; the Supabase
// provider's callback moved here during the cutover and this file kept the two
// paths working side by side. That migration is over: Auth0 is the only front
// door, so there is no code to exchange and no session to create.
//
// The route is kept (rather than deleted) because Supabase OAuth state from the
// retired button, bookmarks, and provider redirect URIs still point at it. Every
// branch must redirect: a 200 or a 404 here strands someone mid-auth.
//
// A relative-safe absolute redirect to /login?error=auth0_only explains what
// happened using our own fixed error code -- never provider text.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login?error=auth0_only`);
}
