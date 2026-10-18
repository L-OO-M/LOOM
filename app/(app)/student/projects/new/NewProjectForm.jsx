"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputStyle } from "@/components/ui";

export default function NewProjectForm({ milestones = [] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [tags, setTags] = useState("");
  const [milestone, setMilestone] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      setMsg("Give your project a title of at least 3 characters.");
      setBusy(false);
      return;
    }
    // The repository is required, and it must be on github.com under your own
    // handle -- the same handle you linked at /student/github. This is the whole
    // reason the project counts for anything: an empty row used to be worth 25
    // points on the public leaderboard, so the registry was worth farming.
    if (!repoUrl.trim()) {
      setMsg("Link the GitHub repository for this project — without one there is nothing to verify.");
      setBusy(false);
      return;
    }
    if (!/^https?:\/\/.+\..+/.test(repoUrl.trim())) {
      setMsg("Repository URL must be a full URL starting with http(s)://");
      setBusy(false);
      return;
    }
    if (!/^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+/i.test(repoUrl.trim())) {
      setMsg("That does not look like a GitHub repository — it should look like https://github.com/you/repo");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          description,
          repoUrl: repoUrl.trim(),
          tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
          roadmapNodeId: milestone || null
        })
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "Creation failed. Try again.");
        return;
      }
      router.push(`/student/projects/${data.data.project.id}`);
      router.refresh();
    } catch {
      setMsg("Network error — the project was not created. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <Field label="Title" hint="3–120 characters. Name the thing you're building.">
        <input
          id="new-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={120}
          autoFocus
          placeholder="e.g. Campus lost-and-found board"
          aria-describedby="new-title-hint"
          style={inputStyle}
        />
      </Field>
      <Field label="Description" hint="What will it do, and who is it for? Max 2000 characters.">
        <textarea
          id="new-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="A simple board where students post and claim lost items…"
          style={inputStyle}
        />
      </Field>
      <Field
        label="GitHub repository"
        hint="Required, and it must be a repo under your own GitHub handle. Link that handle at /student/github first."
      >
        <input
          id="new-repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          type="url"
          inputMode="url"
          required
          placeholder="https://github.com/you/repo"
          style={inputStyle}
        />
      </Field>
      <Field label="Tags (optional)" hint="Comma-separated, up to 8 — e.g. react, firebase, auth.">
        <input
          id="new-tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          maxLength={200}
          placeholder="react, firebase, auth"
          style={inputStyle}
        />
      </Field>
      {milestones.length > 0 && (
        <Field label="Roadmap milestone (optional)" hint="Which milestone does this project grow from?">
          <select
            id="new-milestone"
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
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className="btn-ink disabled:opacity-50">
          {busy ? "Creating…" : "Create project"}
        </button>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          A new project counts as <strong>pending</strong> — worth nothing on the
          leaderboard until we see real activity in that repository, or a chapter
          lead confirms it.
        </p>
      </div>
    </form>
  );
}
