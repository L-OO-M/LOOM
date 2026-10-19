import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { homeForRole } from "@/lib/auth";
import { provisionGitHubIdentity } from "@/lib/github-identity";

// The Supabase OAuth callback (PKCE).
//
// This was /auth/callback until Auth0 became the front door and the SDK claimed
// that path for its own OAuth exchange. The Supabase identity provider is kept
// during the migration, so its callback moved here rather than being deleted.
//
// Serves both providers: magic links and GitHub sign-in both land here. For
// GitHub it additionally records the verified identity, because Supabase
// establishes WHO the person is and the rest of the app needs that on
// github_connections.
//
// Scope warning, because this is easy to over-read: Supabase's GitHub provider
// requests only `read:user user:email`. This provisions IDENTITY. It does not
// provision repository access and cannot verify a project -- that is the
// separate grant at /api/github/oauth/callback.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Record the GitHub identity BEFORE redirecting, so the first render of
      // the workspace already has it. getRequestContext runs twice on purpose:
      // once to have a sql handle for the write, once to resolve the role-aware
      // landing. They are sequential reads against the same cookie, so this is
      // two small queries, not two connections -- page queries stay sequential
      // per the pooler rule.
      try {
        const ctx = await getRequestContext();
        if (!ctx.error && data?.user) {
          const result = await provisionGitHubIdentity({
            sql: ctx.sql,
            tenantId: ctx.tenant?.id,
            userId: ctx.user.id,
            user: data.user
          });
          if (result.linked) {
            await writeAudit({
              sql: ctx.sql,
              actorId: ctx.user.id,
              tenantId: ctx.tenant?.id,
              action: "linked_github_identity",
              resource: "github_connection",
              resourceId: ctx.user.id,
              after: { login: result.login, immutable: result.immutable, via: "supabase_oauth" }
            });
          }
        }
      } catch {
        /* never fail a completed sign-in over identity provisioning — the
           member can re-link from /student/github, and losing their session
           would be strictly worse than losing the convenience. */
      }

      // Role-aware landing (falls back to /student for brand-new profiles).
      try {
        const ctx = await getRequestContext();
        if (!ctx.error && ctx.profile) {
          return NextResponse.redirect(`${origin}${homeForRole(ctx.profile.role)}`);
        }
      } catch { /* fall through to default */ }
      return NextResponse.redirect(`${origin}/student`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
