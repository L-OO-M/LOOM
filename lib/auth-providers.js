import { env } from "@/lib/env";

// Which identity providers this Supabase project actually has enabled.
//
// Signing in with a provider that is switched off in the Supabase dashboard
// does not return an error to the page: signInWithOAuth hands back the provider
// URL and the browser navigates to Supabase, which then renders a raw JSON 400
// ("Unsupported provider: provider is not enabled"). Checking first lets the
// button stay on /login and explain the problem in the UI instead.

/** Normalise the public /auth/v1/settings payload; unknown fields stay false. */
export function normalizeAuthProviders(settings) {
  const external = settings?.external;
  return {
    email: external?.email === true,
    github: external?.github === true
  };
}

/**
 * Read Supabase's public provider settings.
 *
 * Returns null when the check itself fails, which callers must treat as
 * "unknown" rather than "disabled": a transient network blip must not block a
 * working sign-in. Only an explicit `github: false` is actionable.
 */
export async function getSupabaseAuthProviders() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;

  try {
    const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
    const res = await fetch(`${base}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      // Provider switches must be visible immediately after an operator flips
      // them. The route is force-dynamic and this call is tiny.
      cache: "no-store"
    });
    if (!res.ok) return null;
    return normalizeAuthProviders(await res.json());
  } catch {
    return null;
  }
}
