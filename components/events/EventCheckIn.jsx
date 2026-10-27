"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputStyle } from "@/components/ui";

// Door check-in is used by the admin console and the lead workshop console.
// One component means one API contract and one success message.
export function EventCheckIn({ eventId, endpoint = "/api/admin/events" }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("Checking in…");
    try {
      const res = await fetch(`${endpoint}/${eventId}/attendance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checkInCode: code.trim().toUpperCase() })
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "Could not check in this code.");
        return;
      }
      setCode("");
      setMsg(`Checked in — certificate ${data.data.certificate.verification_code}`);
      router.refresh();
    } catch {
      setMsg("Network error — nobody was checked in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
      <Field label="Door code (e.g. LOOM-AB12CD34)">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          minLength={4}
          maxLength={20}
          style={{ ...inputStyle, minWidth: 200 }}
        />
      </Field>
      <button className="btn-ink" disabled={busy}>{busy ? "Checking in…" : "Check in"}</button>
      {msg && <p role="status" className="text-xs" style={{ color: "var(--text-muted)" }}>{msg}</p>}
    </form>
  );
}
