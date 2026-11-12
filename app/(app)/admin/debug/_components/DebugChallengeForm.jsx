"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bug, Pencil, Plus, Save, Send } from "lucide-react";
import { ActionFeedback, postJSON } from "@/components/loom/useAction";
import { Field, inputStyle } from "@/components/ui";
import { StatusPill } from "@/components/loom/primitives";
import { DOMAIN_LABEL, PRIMARY_DOMAINS } from "@/lib/domains";

const EMPTY = {
  id: null,
  slug: "",
  title: "",
  domain: "",
  difficulty: "beginner",
  repoPath: "domains/",
  brief: "",
  verification: "",
  isPublished: false
};

export function DebugChallengeForm({ challenges }) {
  const router = useRouter();
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function open(challenge = null) {
    setMessage("");
    setError("");
    setDraft(
      challenge
        ? {
            id: challenge.id,
            slug: challenge.slug,
            title: challenge.title,
            domain: challenge.domain,
            difficulty: challenge.difficulty,
            repoPath: challenge.repoPath,
            brief: challenge.brief,
            verification: challenge.verification,
            isPublished: challenge.isPublished
          }
        : { ...EMPTY }
    );
  }

  function change(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save(event, publish) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const result = await postJSON("/api/admin/debug/challenges", "POST", {
      id: draft.id || undefined,
      slug: draft.slug.trim(),
      title: draft.title,
      domain: draft.domain.trim(),
      difficulty: draft.difficulty,
      repoPath: draft.repoPath.trim(),
      brief: draft.brief,
      verification: draft.verification,
      isPublished: publish
    });
    if (result.ok) {
      setMessage(publish ? "Challenge published." : "Draft saved.");
      setDraft(null);
      router.refresh();
    } else {
      setError(result.error?.message || "Could not save this challenge.");
    }
    setBusy(false);
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="meta">{challenges.length} challenges / {challenges.filter((item) => item.isPublished).length} published</p>
        <button type="button" className="btn-ink inline-flex items-center gap-1.5" onClick={() => open()}>
          <Plus size={14} /> New challenge
        </button>
      </div>

      {draft ? (
        <form
          onSubmit={(event) => save(event, true)}
          className="mt-4 grid gap-4 rounded-2xl border p-5"
          style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{draft.id ? "Edit challenge" : "New challenge"}</p>
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)} disabled={busy}>Cancel</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Slug" hint="Stable URL: /student/debug/<slug>">
              <input value={draft.slug} onChange={(event) => change("slug", event.target.value)} required pattern="[a-z0-9-]+" maxLength={80} placeholder="off-by-one-total" style={inputStyle} />
            </Field>
            <Field label="Title">
              <input value={draft.title} onChange={(event) => change("title", event.target.value)} required maxLength={160} style={inputStyle} />
            </Field>
            <Field label="Domain" hint="The LOOM domain that owns review.">
              <select value={draft.domain} onChange={(event) => change("domain", event.target.value)} required style={inputStyle}>
                <option value="" disabled>Select a domain</option>
                {PRIMARY_DOMAINS.map((domain) => (
                  <option key={domain} value={domain}>{DOMAIN_LABEL[domain] || domain}</option>
                ))}
              </select>
            </Field>
            <Field label="Difficulty">
              <select value={draft.difficulty} onChange={(event) => change("difficulty", event.target.value)} style={inputStyle}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </Field>
            <Field label="Repository path" hint="Inside the external challenge repo.">
              <input value={draft.repoPath} onChange={(event) => change("repoPath", event.target.value)} required pattern="domains/[a-z0-9-]+/[a-z0-9-]+" maxLength={200} placeholder="domains/web-dev/off-by-one-total" style={inputStyle} />
            </Field>
            <Field label="Public state">
              <div className="flex h-10 items-center gap-2">
                <StatusPill>{draft.isPublished ? "published" : "draft"}</StatusPill>
                <span className="meta">Publishing sets the timestamp used for fork checks.</span>
              </div>
            </Field>
          </div>
          <Field label="Challenge brief" hint="What is broken and how to reproduce it. Plain text.">
            <textarea value={draft.brief} onChange={(event) => change("brief", event.target.value)} rows={6} maxLength={5000} style={inputStyle} />
          </Field>
          <Field label="Verification notes" hint="What the reviewer should check beyond the automated fork test.">
            <textarea value={draft.verification} onChange={(event) => change("verification", event.target.value)} rows={4} maxLength={5000} style={inputStyle} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-ghost inline-flex items-center gap-1.5" disabled={busy} onClick={(event) => save(event, false)}>
              <Save size={14} /> Save draft
            </button>
            <button type="submit" className="btn-ink inline-flex items-center gap-1.5" disabled={busy}>
              <Send size={14} /> {busy ? "Saving..." : "Publish challenge"}
            </button>
            <ActionFeedback msg={message} error={error} />
          </div>
        </form>
      ) : null}

      {!draft && challenges.length === 0 ? (
        <div className="mt-4 rounded-2xl border p-6 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <Bug size={22} className="mx-auto" style={{ color: "var(--text-muted)" }} />
          <p className="mt-2 text-sm font-semibold" style={{ color: "var(--text)" }}>No debug challenges authored.</p>
          <p className="narrative mt-2 text-xs">Create a challenge only after the bug exists in the external starter repository.</p>
        </div>
      ) : !draft ? (
        <ul className="mt-4 grid gap-2">
          {challenges.map((challenge) => (
            <li key={challenge.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{challenge.title}</span>
                  <StatusPill>{challenge.isPublished ? "published" : "draft"}</StatusPill>
                </span>
                <span className="meta mt-1 block">/{challenge.slug} / {challenge.domain} / {challenge.difficulty} / {challenge.repoPath}</span>
              </span>
              <button type="button" className="btn-ghost inline-flex items-center gap-1.5" onClick={() => open(challenge)}>
                <Pencil size={13} /> Edit
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
