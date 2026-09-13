"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";

export default function ClaimForm() {
  const router = useRouter();
  const [prUrl, setPrUrl] = useState("");
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/opensource/contributions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prUrl, title })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setPrUrl("");
    setTitle("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <Field label="Pull request or issue URL" hint="Must link a pull/issue in a tracked repo below.">
        <input value={prUrl} onChange={(e) => setPrUrl(e.target.value)} required type="url" placeholder="https://github.com/owner/repo/pull/123" style={inputStyle} />
      </Field>
      <Field label="Title (optional)">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Fix login redirect on mobile" style={inputStyle} />
      </Field>
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink disabled:opacity-50">
        {busy ? "Claiming…" : "Claim contribution"}
      </button>
    </form>
  );
}
