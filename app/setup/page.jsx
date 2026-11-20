"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { inputStyle } from "@/components/ui";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [setupEnabled, setSetupEnabled] = useState(true);

  useEffect(() => {
    let live = true;

    // Auth state comes from /api/profile, which resolves the canonical identity
    // from the Auth0 session. The page used to call supabase.auth.getUser()
    // directly, so an Auth0 session looked like a signed-out visitor and /setup
    // bounced them to /login forever.
    async function check() {
      try {
        const me = await fetch("/api/profile", { cache: "no-store" });
        if (!live) return;
        if (me.status === 401) {
          router.replace("/login?redirect=/setup");
          return;
        }
        const setup = await fetch("/api/admin/check-setup", { cache: "no-store" });
        const data = await setup.json();
        if (!live) return;
        const payload = data?.data ?? data;
        if (payload?.needsSetup) {
          setSetupEnabled(payload.setupEnabled !== false);
          setChecking(false);
        } else {
          router.replace("/admin");
        }
      } catch {
        if (live) setError("Could not check setup state. Reload to try again.");
      }
    }

    check();
    return () => { live = false; };
  }, [router]);

  async function claimAdmin(event) {
    event.preventDefault();
    if (!code.trim()) {
      setError("Enter the setup code you were given.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/claim-first", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The server resolves the user id from the session; sending it was only
        // ever a cross-check. Leaving it out means this page never has to know
        // which identity provider the visitor used.
        //
        // The code is the bootstrap gate: without it the endpoint is an open
        // land grab for whoever signs in first.
        body: JSON.stringify({ code: code.trim() })
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Failed to claim admin");
        return;
      }
      setDone(true);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--bg)" }} aria-busy="true">
        <div className="text-center" role="status" aria-live="polite">
          <LoaderCircle
            size={26}
            className="mx-auto animate-spin motion-reduce:animate-none"
            style={{ color: "var(--accent)" }}
            aria-hidden="true"
            strokeWidth={1.5}
          />
          <h1 className="mt-4 text-lg font-semibold" style={{ color: "var(--text)" }}>Checking your setup</h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>This takes a moment.</p>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--bg)" }}>
        <div className="max-w-sm text-center">
          <ShieldCheck size={32} style={{ color: "var(--accent)" }} className="mx-auto" strokeWidth={1.5} />
          <h1 className="mt-4 text-xl font-semibold" style={{ color: "var(--text)" }}>You are the admin</h1>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            Platform admin is now active for this account.
          </p>
          <button onClick={() => router.push("/admin")} className="btn-ink mt-6">
            Go to admin
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm text-center">
        <ShieldCheck size={32} style={{ color: "var(--accent)" }} className="mx-auto" strokeWidth={1.5} />
        <h1 className="mt-4 text-xl font-semibold" style={{ color: "var(--text)" }}>Initialize LOOM</h1>
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
          No platform admin exists yet. Enter the one-time setup code from the platform
          owner. The account signed in now becomes a permanent founder admin, and this
          page closes for good once the claim succeeds.
        </p>
        {error && <p role="alert" className="mt-3 text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
        {!setupEnabled ? (
          <p className="mt-4 rounded-lg border px-3 py-2 text-left text-xs leading-5" style={{ borderColor: "var(--line)", background: "var(--wash)", color: "var(--text-muted)" }}>
            Online setup is turned off on this deployment. The platform owner must set
            FIRST_ADMIN_CODE (at least 16 characters) and reload this page, or seed the
            founder account directly with load/seed-founder.js.
          </p>
        ) : (
          <form onSubmit={claimAdmin} className="mt-5 text-left">
            <label htmlFor="setup-code" className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Setup code
            </label>
            <input
              id="setup-code"
              name="setup-code"
              type="password"
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="mt-1.5"
              style={inputStyle}
              aria-describedby="setup-code-hint"
              required
            />
            <p id="setup-code-hint" className="mt-1.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
              This is the value of FIRST_ADMIN_CODE on the server. It is never stored in the browser.
            </p>
            <button type="submit" disabled={busy} className="btn-ink mt-5 w-full justify-center" aria-busy={busy}>
              {busy ? (
                <>
                  <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  Claiming
                </>
              ) : (
                <>
                  Claim admin <ArrowRight size={15} aria-hidden="true" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
