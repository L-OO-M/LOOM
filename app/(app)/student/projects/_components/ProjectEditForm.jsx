"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputStyle } from "@/components/ui";

export default function ProjectEditForm({ project, milestones = [] }) {
  const router = useRouter();
  const [title, setTitle] = useState(project.title || "");
  const [description, setDescription] = useState(project.description || "");
  const [repoUrl, setRepoUrl] = useState(project.repo_url || "");
  const [tags, setTags] = useState((project.tags || []).join(", "));
  const [milestone, setMilestone] = useState(project.roadmap_node_id || "");
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setSaved(false);
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      setMsg("Title needs at least 3 characters.");
      setBusy(false);
      return;
    }
    if (repoUrl.trim() && !/^https?:\/\/.+\..+/.test(repoUrl.trim())) {
      setMsg("Repository URL must be a full URL starting with http(s)://.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          description,
          repoUrl: repoUrl.trim() || null,
          tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
          roadmapNodeId: milestone || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "Save failed.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setMsg("Network error — changes were not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title" hint="3–120 characters. Name the thing you're building.">
        <input
          id="edit-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={120}
          aria-invalid={msg ? true : undefined}
          style={inputStyle}
        />
      </Field>
      <Field label="Description" hint="What does it do, and what did you learn? Max 2000 characters.">
        <textarea
          id="edit-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
          style={inputStyle}
        />
      </Field>
      <Field label="Repository URL" hint="Optional. A full https:// link to the code.">
        <input
          id="edit-repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          type="url"
          inputMode="url"
          placeholder="https://github.com/you/repo"
          style={inputStyle}
        />
      </Field>
      <Field label="Tags" hint="Optional, comma-separated, up to 8. Lowercase, e.g. react, auth.">
        <input
          id="edit-tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          maxLength={200}
          placeholder="react, firebase, auth"
          style={inputStyle}
        />
      </Field>
      {milestones.length > 0 && (
        <Field label="Roadmap milestone" hint="Optional. Which milestone does this project grow from?">
          <select
            id="edit-milestone"
            value={milestone}
            onChange={(e) => setMilestone(e.target.value)}
            style={inputStyle}
          >
            <option value="">No milestone linked</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>{m.title}</option>
            ))}
          </select>
        </Field>
      )}
      {msg && <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      {saved && !msg && <p role="status" className="text-xs" style={{ color: "var(--accent)" }}>Saved.</p>}
      <button disabled={busy} className="btn-ink !py-2 text-sm disabled:opacity-50">
        {busy ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
