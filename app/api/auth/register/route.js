import { fail } from "@/lib/api";

// Retired: Supabase email/password registration.
//
// Account creation now happens entirely on Auth0's Universal Login
// (`/auth/login?screen_hint=signup`), which owns verification, the password
// policy, and the database connection. Nothing here can create an account.
//
// 410 Gone, not 403: the capability is removed, not gated.
export const dynamic = "force-dynamic";

export async function POST() {
  return fail(
    "AUTH0_ONLY",
    "Account registration happens through Auth0 now. Use “Create an account” on the sign-in page.",
    410
  );
}
