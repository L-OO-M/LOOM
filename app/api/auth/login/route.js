import { fail } from "@/lib/api";

// Retired: Supabase email/password sign-in.
//
// The form is gone from /login, the client helper is gone, and this endpoint no
// longer touches Supabase. It stays as a typed tombstone so old clients, cached
// bundles, and bookmarks get an explanation instead of a bare 404, and so the
// path keeps its body-size limit and rate-limit plumbing in middleware.
//
// 410 Gone, not 403: the capability is not gated, it is removed. Nothing in the
// deployment can turn it back on -- Auth0 is the only front door.
export const dynamic = "force-dynamic";

export async function POST() {
  return fail(
    "AUTH0_ONLY",
    "Email and password sign-in has been retired. Continue with Auth0.",
    410
  );
}
