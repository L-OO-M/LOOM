"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function SetupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login?redirect=/setup");
        return;
      }
      setUser(user);
      // Check if any platform admin exists
      fetch("/api/admin/check-setup").then(r => r.json()).then((res) => {
        const needsSetup = res?.data?.needsSetup ?? res?.needsSetup;
        if (needsSetup) setChecking(false);
        else router.push("/admin");
      });
    });
  }, []);

  async function claimAdmin() {
    setError("");
    const res = await fetch("/api/admin/claim-first", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: user.id, email: user.email })
    });
    const data = await res.json();
    if (!data.ok) { setError(data.error?.message || "Failed to claim admin"); return; }
    setDone(true);
  }

  if (checking) return <main className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg)", color: "var(--text-muted)" }}><p className="text-sm">Checking setup state...</p></main>;

  if (done) return (
    <main className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="max-w-sm text-center">
        <ShieldCheck size={32} style={{ color: "var(--accent)" }} className="mx-auto" strokeWidth={1.5} />
        <h1 className="mt-4 text-xl font-semibold" style={{ color: "var(--text)" }}>You are the admin</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Platform admin is now active. Sign in to continue.</p>
        <button onClick={() => router.push("/admin")} className="btn-ink mt-6">
          Go to admin
        </button>
      </div>
    </main>
  );

  return (
    <main className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="max-w-sm text-center">
        <ShieldCheck size={32} style={{ color: "var(--accent)" }} className="mx-auto" strokeWidth={1.5} />
        <h1 className="mt-4 text-xl font-semibold" style={{ color: "var(--text)" }}>Initialize L.O.O.M.</h1>
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
          No platform admin exists yet. Claim admin to set up your college.
        </p>
        {error && <p className="mt-3 text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
        <button onClick={claimAdmin} className="btn-ink mt-6">
          Claim admin <ArrowRight size={15} />
        </button>
      </div>
    </main>
  );
}