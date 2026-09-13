"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProjectForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [tags, setTags] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title, description, repoUrl: repoUrl || null,
        tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8)
      })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    router.push(`/student/projects/${data.data.project.id}`);
    router.refresh();
  }

  const input = { width: "100%", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14 };
  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <label className="block"><span className="text-xs" style={{ color: "var(--text-muted)" }}>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={120} style={{ ...input, marginTop: 6 }} /></label>
      <label className="block"><span className="text-xs" style={{ color: "var(--text-muted)" }}>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={2000} style={{ ...input, marginTop: 6 }} /></label>
      <label className="block"><span className="text-xs" style={{ color: "var(--text-muted)" }}>Repository URL (optional)</span>
        <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} type="url" placeholder="https://github.com/you/repo" style={{ ...input, marginTop: 6 }} /></label>
      <label className="block"><span className="text-xs" style={{ color: "var(--text-muted)" }}>Tags (comma-separated, optional)</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={200} placeholder="react, firebase, auth" style={{ ...input, marginTop: 6 }} /></label>
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink disabled:opacity-50">
        {busy ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
