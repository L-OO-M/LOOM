"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { postJSON } from "@/components/loom/useAction";

/**
 * "You signed in with Google — add a password" card.
 *
 * The backend for this has existed for a while (lib/auth0-management.js,
 * /api/auth/security, /api/auth/password) but nothing in the UI ever called it,
 * so a member who joined through Google or GitHub had no way to ever sign in
 * with a password. That is the gap this closes.
 *
 * Deliberate constraints:
 *  - Only OFFERED when the account has no password identity. Overwriting an
 *    existing password from a session-only request would turn a stolen cookie
 *    into a permanent account takeover, so a member who already has one is told
 *    to use the reset link instead.
 *  - Never offered when the deployment has no Management API credentials; the
 *    card says so rather than showing a button that cannot work.
 *  - Requires a verified email, because setting a password on an unverified
 *    address would let someone claim an identity they have not proven.
 */
export default function AccountSecurityCard({ email = null }) {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("muted");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/security");
        const body = await res.json();
        if (cancelled) return;
        if (!body?.ok) {
          setState({ loading: false, data: null, error: body?.error?.message || "Could not read your sign-in methods." });
          return;
        }
        setState({ loading: false, data: body.data, error: "" });
      } catch {
        if (!cancelled) setState({ loading: false, data: null, error: "Could not read your sign-in methods." });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    // The tenant's connection owns the rule; /api/auth/security reports it. This
    // used to hardcode 8 while Auth0 required 15, so a member was told their
    // password was fine and then rejected by the provider.
    const minLength = state.data?.passwordMinLength || 15;
    if (password.length < minLength) {
      setTone("err");
      setMessage(`Use at least ${minLength} characters.`);
      return;
    }
    if (password !== confirm) {
      setTone("err");
      setMessage("The two passwords do not match.");
      return;
    }
    setBusy(true);
    const data = await postJSON("/api/auth/password", "POST", { password });
    setBusy(false);
    if (data?.ok) {
      setTone("ok");
      setMessage("Password added. You can now sign in with this email and password, or keep using Google.");
      setPassword("");
      setConfirm("");
      setState((prev) => ({ ...prev, data: prev.data ? { ...prev.data, hasPassword: true } : prev.data }));
      router.refresh();
    } else {
      setTone("err");
      setMessage(data?.error?.message || "Could not add a password. Try again.");
    }
  }

  // Legacy Supabase-only deployments have no Auth0 session, so the concept does
  // not apply. Render nothing rather than an empty shell.
  if (state.loading || !state.data?.auth0) {
    if (state.error) {
      return (
        <section aria-label="Sign-in methods" className="mt-10">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Sign-in methods</h2>
          <p className="meta mt-2 normal-case tracking-normal">{state.error}</p>
        </section>
      );
    }
    return null;
  }

  const { hasPassword, emailVerified, passwordMinLength } = state.data;
  const minLength = passwordMinLength || 15;

  return (
    <section aria-label="Sign-in methods" className="mt-10">
      <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Sign-in methods</h2>
      <p className="narrative mt-2">
        Signing in with Google or GitHub never creates a password. Add one if you want the
        option to sign in with your email as well — the account stays the same either way.
      </p>
      {email ? (
        <p className="meta mt-1 normal-case tracking-normal">
          You sign in as <span className="font-mono">{email}</span>.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full border px-3 py-1 text-xs font-semibold"
          style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
        >
          {hasPassword ? "Password set" : "No password"}
        </span>
        <span
          className="rounded-full border px-3 py-1 text-xs font-semibold"
          style={{ borderColor: emailVerified ? "var(--accent)" : "var(--line)", color: emailVerified ? "var(--accent)" : "var(--text-muted)" }}
        >
          {emailVerified ? "Email verified" : "Email not verified"}
        </span>
      </div>

      {hasPassword === null && (
        <p className="meta mt-3 normal-case tracking-normal">
          Password management is not configured for this deployment.
        </p>
      )}

      {hasPassword === true && (
        <p className="meta mt-3 normal-case tracking-normal">
          A password is already attached. To replace it, use the password reset link on the
          sign-in page — changing it from an open session alone would be too easy to abuse.
        </p>
      )}

      {hasPassword === false && !emailVerified && (
        <p className="meta mt-3 normal-case tracking-normal">
          Confirm your email address first. A password on an unverified address would let
          someone claim an identity they have not proven.
        </p>
      )}

      {hasPassword === false && emailVerified && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="new-password" className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={minLength}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", color: "var(--text)", background: "var(--bg)" }}
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              minLength={minLength}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", color: "var(--text)", background: "var(--bg)" }}
            />
          </div>
          <p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>
            At least {minLength} characters — a short phrase works, no symbols required.
          </p>
          <button type="submit" disabled={busy} className="btn-ghost !py-1.5 text-xs disabled:opacity-50">
            {busy ? "Adding…" : "Add password"}
          </button>
        </form>
      )}

      {message && (
        <p
          role="status"
          className="mt-3 text-xs"
          style={{ color: tone === "err" ? "var(--danger)" : "var(--accent)" }}
        >
          {message}
        </p>
      )}
    </section>
  );
}
