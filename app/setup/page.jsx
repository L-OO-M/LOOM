"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;

    // Auth state comes from /api/profile, which resolves the canonical identity
    // from EITHER front door (Auth0 or the Supabase fallback). The page used to
    // call supabase.auth.getUser() directly, so an Auth0 session looked like a
    // signed-out visitor and /setup bounced them to /login forever.
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
        if (data?.data?.needsSetup ?? data?.needsSetup) setChecking(false);
        else router.replace("/admin");
      } catch {
        if (live) setError("Could not check setup state. Reload to try again.");
      }
    }

    check();
    return () => { live = false; };
  }, [router]);

  async function claimAdmin() {
    setError("");
    setChecking(true);
    try {
      const res = await fetch("/api/admin/claim-first", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The server resolves the user id from the session; sending it was only
        // ever a cross-check. Leaving it out means this page never has to know
        // which identity provider the visitor used.
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Failed to claim admin");
        setChecking(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Could not reach the server. Try again.");
      setChecking(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--bg)" }}>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Checking setup state…</p>
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
      <div className="max-w-sm text-center">
        <ShieldCheck size={32} style={{ color: "var(--accent)" }} className="mx-auto" strokeWidth={1.5} />
        <h1 className="mt-4 text-xl font-semibold" style={{ color: "var(--text)" }}>Initialize LOOM</h1>
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
          No platform admin exists yet. Claim admin to set up your college. This can only be
          done once, by the account that is signed in now.
        </p>
        {error && <p role="alert" className="mt-3 text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
        <button onClick={claimAdmin} className="btn-ink mt-6">
          Claim admin <ArrowRight size={15} />
        </button>
      </div>
    </main>
  );
}
