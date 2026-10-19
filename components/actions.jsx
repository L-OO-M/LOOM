"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function postJSON(url, body) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return res.json();
  } catch {
    // Never throw: every caller renders {ok:false} as an inline message
    // instead of wedging its button in a busy state.
    return { ok: false, error: { message: "Couldn't reach the server. Try again." } };
  }
}

export function MarkCompleteButton({ nodeId, completed }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function run() {
    setBusy(true);
    setMsg("");
    const data = await postJSON("/api/roadmap/progress", { nodeId, status: "completed" });
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    router.refresh();
  }
  if (completed) return <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>Completed ✓</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={busy} className="btn-ink disabled:opacity-50">
        {busy ? "Saving…" : "Mark complete"}
      </button>
      {msg && <span className="text-xs" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}

export function ResourceCompleteButton({ resourceId, completed }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function run() {
    setBusy(true);
    setMsg("");
    const data = await postJSON("/api/resources", { resourceId });
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Couldn't save. Try again.");
      return;
    }
    router.refresh();
  }
  if (completed) return <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>Done ✓</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={busy} className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97] disabled:opacity-50" style={{ borderColor: "var(--line)", color: "var(--text)" }}>
        {busy ? "Saving…" : "Mark done"}
      </button>
      {msg && <span className="text-xs" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}

export function ContestRegisterButton({ contestId, registered, open }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function run() {
    setBusy(true);
    setMsg("");
    const data = await postJSON("/api/contests", { contestId });
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    router.refresh();
  }
  if (registered) return <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>Registered ✓</span>;
  if (!open) return <span className="text-xs" style={{ color: "var(--text-muted)" }}>Not open</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={busy} className="btn-ink disabled:opacity-50">
        {busy ? "Registering…" : "Register"}
      </button>
      {msg && <span className="text-xs" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}

export function MentorRequestButton({ mentorId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function run() {
    setBusy(true);
    setMsg("");
    const data = await postJSON("/api/mentorship", { mentorId });
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setMsg("Requested ✓");
    router.refresh();
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={busy} className="btn-ink disabled:opacity-50">
        {busy ? "Requesting…" : "Request session"}
      </button>
      {msg && <span className="text-xs" style={{ color: msg.includes("✓") ? "var(--accent)" : "var(--danger)" }}>{msg}</span>}
    </span>
  );
}

export function MarkNotificationRead({ id, read }) {
  const router = useRouter();
  if (read) return null;
  async function run() {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    router.refresh();
  }
  return (
    <button onClick={run} className="text-xs font-medium" style={{ color: "var(--accent)" }}>
      Mark read
    </button>
  );
}

/**
 * Start the GitHub repository grant.
 *
 * This navigates to /api/github/oauth/start, which sets a signed state cookie
 * and 302s to GitHub. It is deliberately a full-page navigation rather than a
 * fetch: OAuth is a browser redirect chain, and there is nothing to await.
 *
 * `repos` is an optional allow-list of `owner/repo` pairs to verify during the
 * grant. It is not trusted here -- the server re-validates and signs it into the
 * state cookie -- but passing it means the student does not have to click through
 * a second confirmation afterwards.
 */
export function GithubLinkButton({ label = "Link GitHub account", repos = null, disabled = false, note = null }) {
  const params = new URLSearchParams();
  if (Array.isArray(repos) && repos.length) params.set("repos", repos.join(","));
  const href = `/api/github/oauth/start${params.toString() ? `?${params.toString()}` : ""}`;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <a
        href={href}
        className={`btn-ink ${disabled ? "pointer-events-none opacity-50" : ""}`}
        aria-disabled={disabled || undefined}
        style={{ textDecoration: "none" }}
      >
        {label}
      </a>
      {note && <span className="meta">{note}</span>}
    </span>
  );
}

/**
 * @deprecated Removed. Linking is done through GitHub OAuth, because a typed
 * handle is an assertion rather than proof — see lib/github-oauth.js and
 * migration 038. The old form is gone rather than left to fail, so no surface
 * can offer a path that is guaranteed to 409.
 */
