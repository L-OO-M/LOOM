import { ok } from "@/lib/api";

// Public capability probe for the auth screens.
//
// It used to read which providers the Supabase project had switched on, because
// a disabled provider produced a raw Supabase JSON error mid-redirect. Supabase
// is no longer an identity provider at all: Auth0 owns the front door, and which
// social connections appear is decided on Auth0's Universal Login page, not
// here.
//
// The route stays public and keeps its old keys (`email`/`github`) so a cached
// client gets a truthful answer instead of a 404. `auth0` is the only method
// this app can honestly advertise; GitHub via Auth0 is not the Supabase
// `github` provider the flag used to describe.
export const dynamic = "force-dynamic";

export async function GET() {
  return ok(
    {
      auth0: true,
      email: false,
      github: false
    },
    { headers: { "cache-control": "no-store" } }
  );
}
