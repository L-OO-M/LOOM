"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";
import { postJSON, useAction, ActionFeedback } from "@/components/loom/useAction";

export function CurateForm() {
  const router = useRouter();
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [difficulty, setDifficulty] = useState("beginner");
  const [primaryDomain, setPrimaryDomain] = useState("web");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/opensource/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner, repo, difficulty, primaryDomain })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setOwner("");
    setRepo("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
      <Field label="Owner"><input value={owner} onChange={(e) => setOwner(e.target.value)} required placeholder="facebook" style={inputStyle} /></Field>
      <Field label="Repo"><input value={repo} onChange={(e) => setRepo(e.target.value)} required placeholder="react" style={inputStyle} /></Field>
      <Field label="Difficulty">
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={inputStyle}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </Field>
      <Field label="Domain"><input value={primaryDomain} onChange={(e) => setPrimaryDomain(e.target.value)} style={inputStyle} /></Field>
      <div className="sm:col-span-2">
        {msg && <p className="mb-2 text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
        <button disabled={busy} className="btn-ink disabled:opacity-50">{busy ? "Curating…" : "Curate repo (live GitHub data)"}</button>
      </div>
    </form>
  );
}

export function ReviewButtons({ id }) {
  // Was fire-and-forget: a failed verify/reject left the row in the queue with
  // no message, so the admin could not tell "rejected" from "rejected by 500".
  const [decision, setDecision] = useState(null);
  const { busy, msg, error, run } = useAction((status) =>
    postJSON(`/api/opensource/contributions/${id}`, "PATCH", { status }));

  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <button disabled={busy} onClick={() => { setDecision("verified"); run("verified"); }} className="btn-ink disabled:opacity-50">
        {busy && decision === "verified" ? "Verifying…" : "Verify"}
      </button>
      <button disabled={busy} onClick={() => { setDecision("rejected"); run("rejected"); }}
        className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
        {busy && decision === "rejected" ? "Rejecting…" : "Reject"}
      </button>
      <ActionFeedback msg={busy ? "" : msg} error={busy ? "" : error} />
    </span>
  );
}
