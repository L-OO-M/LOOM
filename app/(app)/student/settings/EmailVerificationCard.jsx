"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJSON } from "@/components/loom/useAction";

/**
 * Optional email verification.
 *
 * The copy is explicit that this does not gate anything. If a member never
 * verifies, nothing breaks; if the deployment has no email provider, the control
 * says so instead of offering a button that cannot work.
 */
export default function EmailVerificationCard({ verifiedAt, email, configured }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("muted");

  async function send() {
    setBusy(true);
    setMessage("");
    const data = await postJSON("/api/auth/verify-email/start", "POST", {});
    setBusy(false);
    if (data?.ok) {
      setTone("ok");
      setMessage(
        data.data?.alreadyVerified
          ? "This address is already confirmed."
          : `Link sent to ${data.data?.email || email}. It expires in 24 hours.`
      );
      router.refresh();
    } else {
      setTone("err");
      setMessage(data?.error?.message || "Couldn’t send the link. Try again.");
    }
  }

  return (
    <section aria-label="Email verification" className="mt-10">
      <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Email verification</h2>
      <p className="narrative mt-2">
        Optional. Confirming your address marks the account as verified; it does not unlock
        features, and your account works without it.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: verifiedAt ? "var(--accent)" : "var(--line)", color: verifiedAt ? "var(--accent)" : "var(--text-muted)" }}>
          {verifiedAt ? "Verified" : "Not verified"}
        </span>
        <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{email}</span>
        {!verifiedAt && configured && (
          <button type="button" onClick={send} disabled={busy} className="btn-ghost !py-1.5 text-xs disabled:opacity-50">
            {busy ? "Sending…" : "Send verification link"}
          </button>
        )}
      </div>
      {!verifiedAt && !configured && (
        <p className="meta mt-2 normal-case tracking-normal">
          Email verification is not configured for this deployment.
        </p>
      )}
      {message && (
        <p className="mt-2 text-xs" style={{ color: tone === "err" ? "var(--danger)" : "var(--accent)" }}>
          {message}
        </p>
      )}
    </section>
  );
}
