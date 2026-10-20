"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Field, inputStyle } from "@/components/ui";

function humanize(name) {
  return String(name || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function compact(n) {
  const value = Number(n) || 0;
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export default function NewProjectForm({ milestones = [], githubConnected = false }) {
  const router = useRouter();
  const [mode, setMode] = useState(githubConnected ? "picker" : "url");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [tags, setTags] = useState("");
  const [milestone, setMilestone] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [repos, setRepos] = useState([]);
  const [repoState, setRepoState] = useState(githubConnected ? "loading" : "unlinked");
  const [repoError, setRepoError] = useState("");
  const [repoPage, setRepoPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [repoQuery, setRepoQuery] = useState("");

  const [creatingRepo, setCreatingRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDescription, setNewRepoDescription] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);
  const [newRepoBusy, setNewRepoBusy] = useState(false);
  const [newRepoError, setNewRepoError] = useState("");

  async function loadRepos(page = 1, append = false) {
    setRepoState((s) => (append ? s : "loading"));
    setRepoError("");
    try {
      const res = await fetch(`/api/github/repos?page=${page}`);
      const data = await res.json();
      if (!data?.ok) {
        setRepoState("error");
        setRepoError(data?.error?.message || "GitHub repositories could not be loaded.");
        return;
      }
      setRepos((current) => (append ? [...current, ...data.data.repos] : data.data.repos));
      setRepoPage(page);
      setHasMore(Boolean(data.data.hasMore));
      setRepoState("ready");
    } catch {
      setRepoState("error");
      setRepoError("Network error while loading repositories.");
    }
  }

  useEffect(() => {
    if (!githubConnected) return;
    loadRepos(1, false);
    // loadRepos is intentionally not a dependency: it is recreated each render
    // and this effect should run only when the linked state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [githubConnected]);

  const filtered = useMemo(() => {
    const q = repoQuery.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) =>
      `${r.fullName} ${r.description || ""} ${r.language || ""}`.toLowerCase().includes(q)
    );
  }, [repos, repoQuery]);

  function chooseRepo(repo) {
    if (repo.alreadyLinked) return;
    setRepositoryId(repo.id);
    setRepoUrl(repo.htmlUrl);
    if (!title.trim()) setTitle(humanize(repo.name));
    if (!description.trim() && repo.description) setDescription(repo.description);
    if (!tags.trim()) {
      const hints = [...(repo.topics || []).slice(0, 5), repo.language].filter(Boolean);
      setTags([...new Set(hints)].slice(0, 8).join(", "));
    }
  }

  async function createRepository(e) {
    e.preventDefault();
    setNewRepoBusy(true);
    setNewRepoError("");
    try {
      const res = await fetch("/api/github/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: newRepoName.trim(),
          description: newRepoDescription.trim(),
          isPrivate: newRepoPrivate
        })
      });
      const data = await res.json();
      if (!data?.ok) {
        setNewRepoError(data?.error?.message || "The repository could not be created.");
        return;
      }
      const created = {
        id: data.data.repo.id,
        fullName: data.data.repo.full_name,
        owner: data.data.repo.owner,
        name: data.data.repo.name,
        htmlUrl: data.data.repo.html_url,
        description: data.data.repo.description,
        language: data.data.repo.language,
        stars: data.data.repo.stars,
        openIssues: data.data.repo.open_issues,
        topics: data.data.repo.topics || [],
        isPrivate: data.data.repo.is_private,
        pushedAt: data.data.repo.pushed_at,
        alreadyLinked: false
      };
      setRepos((current) => [created, ...current]);
      chooseRepo(created);
      setCreatingRepo(false);
      setNewRepoName("");
      setNewRepoDescription("");
    } catch {
      setNewRepoError("Network error — the repository was not created.");
    } finally {
      setNewRepoBusy(false);
    }
  }

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
    if (mode === "picker" && !repositoryId) {
      setMsg("Choose one of your GitHub repositories, or switch to pasting a URL.");
      setBusy(false);
      return;
    }
    if (mode === "url") {
      if (!repoUrl.trim()) {
        setMsg("Link the GitHub repository for this project — without one there is nothing to verify.");
        setBusy(false);
        return;
      }
      if (!/^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+/i.test(repoUrl.trim())) {
        setMsg("That does not look like a GitHub repository — it should look like https://github.com/you/repo");
        setBusy(false);
        return;
      }
    }
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          description,
          ...(mode === "picker" ? { repositoryId } : { repoUrl: repoUrl.trim() }),
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
      <div>
        <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Repository</p>
        <div className="seg mt-2" role="tablist" aria-label="How to choose a repository">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "picker"}
            aria-pressed={mode === "picker"}
            onClick={() => setMode("picker")}
          >
            My GitHub repos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "url"}
            aria-pressed={mode === "url"}
            onClick={() => setMode("url")}
          >
            Paste a URL
          </button>
        </div>
      </div>

      {mode === "picker" && (
        <div>
          {!githubConnected || repoState === "unlinked" ? (
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>GitHub is not linked yet.</p>
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                Link your account so LOOM can read repositories you own and prove the project is yours.
              </p>
              <Link href="/student/github" prefetch={false} className="mt-3 inline-block text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                Link GitHub →
              </Link>
            </div>
          ) : repoState === "loading" ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading repositories from GitHub…</p>
          ) : repoState === "error" ? (
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
              <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{repoError}</p>
              <div className="mt-2 flex flex-wrap gap-3">
                <button type="button" onClick={() => loadRepos(1, false)} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                  Retry
                </button>
                <Link href="/student/github" prefetch={false} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                  Re-link GitHub →
                </Link>
              </div>
            </div>
          ) : repos.length === 0 ? (
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>No repositories you own yet.</p>
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                Create one here, or create it on GitHub and reload this page.
              </p>
              <button type="button" onClick={() => setCreatingRepo(true)} className="mt-3 text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                Create a repository →
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={repoQuery}
                  onChange={(e) => setRepoQuery(e.target.value)}
                  placeholder="Filter your repositories…"
                  aria-label="Filter your repositories"
                  className="min-w-[200px] flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
                />
                <button type="button" onClick={() => setCreatingRepo((v) => !v)} className="btn-ghost !py-2 text-xs" aria-expanded={creatingRepo}>
                  {creatingRepo ? "Close new repo" : "New repository"}
                </button>
              </div>

              <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                {filtered.map((repo) => {
                  const selected = repositoryId === repo.id;
                  return (
                    <li key={repo.id}>
                      <button
                        type="button"
                        onClick={() => chooseRepo(repo)}
                        disabled={repo.alreadyLinked}
                        aria-pressed={selected}
                        className="w-full rounded-xl border p-3 text-left transition disabled:opacity-60"
                        style={{
                          borderColor: selected ? "var(--accent)" : "var(--line)",
                          background: selected ? "var(--wash)" : "var(--bg-muted)"
                        }}
                      >
                        <span className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-mono text-xs font-semibold" style={{ color: "var(--text)" }}>{repo.fullName}</span>
                          <span className="mono-tag" style={{ color: "var(--text-muted)" }}>
                            {repo.isPrivate ? "Private" : "Public"} · ★ {compact(repo.stars)}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                          {repo.alreadyLinked ? "Already used by one of your projects." : repo.description || `${repo.language || "Mixed"} repository`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {filtered.length === 0 && <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>Nothing matched that filter.</p>}
              {hasMore && (
                <button type="button" onClick={() => loadRepos(repoPage + 1, true)} className="mt-3 text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                  Load more repositories →
                </button>
              )}
            </>
          )}

          {creatingRepo && (
            <div className="mt-4 rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Create on GitHub</p>
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                Starts with a README so the repository is immediately valid.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Repository name">
                  <input value={newRepoName} onChange={(e) => setNewRepoName(e.target.value)} maxLength={100} placeholder="campus-lost-and-found" style={inputStyle} aria-label="New repository name" />
                </Field>
                <Field label="Visibility">
                  <select value={newRepoPrivate ? "private" : "public"} onChange={(e) => setNewRepoPrivate(e.target.value === "private")} style={inputStyle} aria-label="New repository visibility">
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Description (optional)">
                  <input value={newRepoDescription} onChange={(e) => setNewRepoDescription(e.target.value)} maxLength={350} style={inputStyle} aria-label="New repository description" />
                </Field>
              </div>
              {newRepoError && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{newRepoError}</p>}
              <button type="button" onClick={createRepository} disabled={newRepoBusy || newRepoName.trim().length < 1} className="btn-ink mt-3 !py-2 text-xs disabled:opacity-50">
                {newRepoBusy ? "Creating…" : "Create repository"}
              </button>
            </div>
          )}
        </div>
      )}

      {mode === "url" && (
        <>
          <Field
            label="GitHub repository"
            hint="It must be a repo under your own GitHub handle. Link that handle at /student/github first."
          >
            <input
              id="new-repo"
              value={repoUrl}
              onChange={(e) => { setRepoUrl(e.target.value); setRepositoryId(""); }}
              type="url"
              inputMode="url"
              required
              placeholder="https://github.com/you/repo"
              style={inputStyle}
            />
          </Field>
          {!githubConnected && (
            <p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>
              Project creation needs a linked GitHub account even when you paste a URL.{" "}
              <Link href="/student/github" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                Link GitHub →
              </Link>
            </p>
          )}
        </>
      )}

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
          A project counts as <strong>verified</strong> only when GitHub confirms the repository
          is yours; otherwise it stays pending until a chapter lead checks it.
        </p>
      </div>
    </form>
  );
}
