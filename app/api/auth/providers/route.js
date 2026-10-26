import { ok } from "@/lib/api";
import { getSupabaseAuthProviders } from "@/lib/auth-providers";

// Public capability probe for the auth screens. It exposes only which sign-in
// methods the Supabase project has enabled -- never credentials, URLs, or user
// data -- so a logged-out visitor can be told the truth before being sent to a
// provider that is switched off.
export const dynamic = "force-dynamic";

export async function GET() {
  const providers = await getSupabaseAuthProviders();
  return ok(
    {
      email: providers?.email ?? null,
      // null means "could not check"; the client treats that as unknown and
      // lets the flow continue rather than disabling a provider on a blip.
      github: providers?.github ?? null
    },
    { headers: { "cache-control": "no-store" } }
  );
}
