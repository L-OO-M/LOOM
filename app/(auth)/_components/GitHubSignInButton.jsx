"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// "Continue with GitHub" — sign-in via Supabase's GitHub provider.
//
// This is the IDENTITY grant and is deliberately separate from the repository
// grant at /api/github/oauth/start. Supabase requests only `read:user
// user:email`; it proves who someone is and grants no repository access. Mixing
// the two is how people end up believing their projects are verified when the
// only thing that happened was a login.
//
// PKCE note: signInWithOAuth stores the code verifier in a cookie, so the
// callback at /auth/supabase-callback can complete the exchange. (Auth0 now owns
// /auth/callback; Supabase's callback moved to keep both providers working.)
//
// Failure here is almost always one of two things, and they need different
// answers, so they are distinguished rather than collapsed into "failed":
//   - the provider is not enabled in Supabase (operator problem)
//   - the user cancelled or the redirect URL is not allow-listed (config)

export default function GitHubSignInButton({ label = "Continue with GitHub" }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const callback = `${window.location.origin}/auth/supabase-callback`;
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        // Scope is deliberately NOT set. Supabase's GitHub provider is
        // configured with `read:user user:email` in the dashboard, and
        // overriding it here to request repository access would fail — Supabase
        // will not mint a token with scopes it was not configured to request,
        // and asking for more is how a login flow acquires a much larger
        // consent screen than the student understands.
        //
        // Repository access is a SEPARATE grant: /api/github/oauth/start.
        options: { redirectTo: callback }
      });
      if (oauthError) {
        setError(
          oauthError.message?.includes("not enabled") || oauthError.message?.includes("provider")
            ? "GitHub sign-in is not enabled for this chapter yet. Use email and password."
            : oauthError.message || "Could not start GitHub sign-in."
        );
        setBusy(false);
        return;
      }
      // Full-page navigation: OAuth is a redirect chain with nothing to await.
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }
      setError("GitHub sign-in did not return an authorization URL.");
      setBusy(false);
    } catch {
      setError("Could not reach GitHub. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="btn-ghost mt-4 w-full justify-center disabled:opacity-60"
        style={{ minHeight: "44px" }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
        {busy ? "Opening GitHub…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
        GitHub confirms your email and identity. It does not by itself verify your
        projects — link a repository separately for that.
      </p>
    </div>
  );
}