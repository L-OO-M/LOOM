"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GithubLinkButton } from "@/components/actions";
import { DataTable } from "@/components/loom/DataTable";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import { StatusPill } from "@/components/loom/primitives";
import ExportGithubButton from "./ExportButton";

/* Client islands for the GitHub workspace. The page stays a server
   component; only the smallest interactive leaves live here. */

export function GithubTabs({ items, repos, daily = [] }) {
  const [tab, setTab] = useState("activity");
  const dailyTotals = daily.reduce(
    (acc, d) => ({
      commits: acc.commits + d.commits,
      pull_requests: acc.pull_requests + d.pull_requests,
      reviews: acc.reviews + d.reviews,
      total: acc.total + d.total,
    }),
    { commits: 0, pull_requests: 0, reviews: 0, total: 0 }
  );
  return (
    <div>
      <div className="seg" role="tablist" aria-label="Building activity views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "activity"}
          onClick={() => setTab("activity")}
        >
          Recent activity
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "daily"}
          onClick={() => setTab("daily")}
        >
          Daily log
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "repos"}
          onClick={() => setTab("repos")}
        >
          Repositories{repos.length > 0 ? ` · ${repos.length}` : ""}
        </button>
      </div>

      {tab === "activity" && (
        <div className="mt-5" role="tabpanel" aria-label="Recent activity">
          {items.length === 0 ? (
            <p className="narrative">No webhook events attributed to you yet. Push to a watched repository and it will stream in here.</p>
          ) : (
            <Timeline>
              {items.map((it, i) => (
                <TimelineItem
                  key={`${it.at}-${i}`}
                  state={it.kind === "pull request" ? "now" : "done"}
                  title={it.text}
                  meta={it.date}
                  body={`${it.kind} · ${it.repo}`}
                  action={it.url ? (
                    <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                      Open on GitHub →
                    </a>
                  ) : null}
                />
              ))}
            </Timeline>
          )}
        </div>
      )}

      {tab === "daily" && (
        <div className="mt-5" role="tabpanel" aria-label="Daily activity">
          {daily.length === 0 ? (
            <p className="narrative">No daily activity recorded yet.</p>
          ) : (
            <>
              <p className="meta mb-3 normal-case tracking-normal">
                Last {daily.length} days — {dailyTotals.commits} commits · {dailyTotals.pull_requests} PRs ·{" "}
                {dailyTotals.reviews} reviews · {dailyTotals.total} total
              </p>
              <DataTable
                caption={`Recorded daily activity for the last ${daily.length} days`}
                columns={[
                  { key: "day", label: "Day", kind: "strong" },
                  { key: "commits", label: "Commits", align: "right", mono: true },
                  { key: "pull_requests", label: "PRs", align: "right", mono: true },
                  { key: "reviews", label: "Reviews", align: "right", mono: true },
                  { key: "total", label: "Total", align: "right", mono: true },
                  { key: "status", label: "Recorded", align: "right" },
                ]}
                rows={daily.map((d) => ({
                  id: d.day,
                  day: new Date(`${d.day}T00:00:00`).toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  }),
                  commits: d.commits,
                  pull_requests: d.pull_requests,
                  reviews: d.reviews,
                  total: d.total,
                  status: d.total > 0 ? "active" : "quiet",
                }))}
              />
            </>
          )}
          <p className="meta mt-3 normal-case tracking-normal">
            Days with nothing recorded are shown as zero, not skipped. Counts come from signed
            webhook deliveries and are never back-filled.
          </p>
        </div>
      )}

      {tab === "repos" && (
        <div className="mt-5" role="tabpanel" aria-label="Active repositories">
          {repos.length === 0 ? (
            <div>
              <p className="narrative">No repository activity has reached LOOM yet.</p>
              <p className="narrative mt-2">Repositories appear here once webhook events arrive carrying them — nothing is guessed or filled in.</p>
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
              {repos.map((r) => (
                <li key={r.name}>
                  <a
                    href={`https://github.com/${r.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="row-link flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-3"
                    aria-label={`${r.name}, ${r.count} recorded events, last active ${r.lastDate}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{r.name}</span>
                      <span className="meta mt-1 block normal-case tracking-normal">{r.kinds} · last {r.lastDate}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <StatusPill>{r.count} event{r.count === 1 ? "" : "s"}</StatusPill>
                      <span className="text-xs font-semibold" style={{ color: "var(--accent)" }} aria-hidden="true">↗</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="meta mt-4 normal-case tracking-normal">Derived from real webhook payloads · no stars, forks, or languages guessed</p>
        </div>
      )}
    </div>
  );
}

export function RepoVerifyPicker({ verified = [] }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState("idle");
  const [repos, setRepos] = useState([]);
  const [nextPage, setNextPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const verifiedSet = new Set(verified.map((name) => String(name).toLowerCase()));

  async function load(page = nextPage) {
    setState("loading");
    setError("");
    try {
      const res = await fetch(`/api/github/repos?page=${page}`);
      const data = await res.json();
      if (!data?.ok) {
        setState("error");
        // If token expired or scopes missing, offer re-link
        if (data?.error?.code === "GITHUB_RELINK_REQUIRED" || data?.error?.code === "GITHUB_SCOPE_MISSING") {
          setError(
            "Your GitHub connection needs to be renewed. Use 'Verify with GitHub' above first."
          );
          // Trigger re-link flow on next render
          setState("relink-required");
        } else {
          setError(
            data?.error?.message || "Repositories could not be loaded."
          );
        }
        return;
      }
      const incoming = data.data.repos || [];
      setRepos((prev) => {
        // Deduplicate by fullName, case-insensitively: GitHub preserves casing
        // and a rename between page requests would otherwise duplicate a row.
        const existing = new Set(prev.map((r) => String(r.fullName).toLowerCase()));
        return [
          ...prev,
          ...incoming.filter((r) => !existing.has(String(r.fullName).toLowerCase()))
        ];
      });
      setNextPage(page + 1);
      setHasMore(
        typeof data.data.hasMore === "boolean" ? data.data.hasMore : incoming.length >= 100
      );
      setState("ready");
    } catch {
      setState("error");
      setError("Network error while loading repositories.");
    }
  }

  async function doVerify() {
    if (selected.length === 0) return;
    setState("verifying");
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/github/repos/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repos: selected })
      });
      const data = await res.json();
      if (!data?.ok) {
        setState("error");
        if (data?.error?.code === "GITHUB_RELINK_REQUIRED" || data?.error?.code === "GITHUB_SCOPE_MISSING") {
          setError(
            "Your GitHub connection needs to be renewed. Use 'Verify with GitHub' above first."
          );
          setState("relink-required");
        } else if (data?.error?.code === "REPO_NOT_FOUND") {
          setError(
            "GitHub could not see those repositories. Check the names, and that the linked account still has access."
          );
        } else if (data?.error?.code === "GITHUB_UNAVAILABLE") {
          setError(
            "GitHub could not confirm any of those repositories. Try again shortly, or re-link GitHub if this repeats."
          );
        } else {
          setError(data?.error?.message || "Verification failed.");
        }
        return;
      }
      // Success: keep the panel open, report what happened, and refresh the
      // server-rendered grant list so the new rows appear immediately.
      setSelected([]);
      setResult({
        added: data.data.added ?? 0,
        activated: data.data.activated ?? 0,
        failed: (data.data.repos || []).filter((r) => !r.ok)
      });
      setNextPage(1);
      setRepos([]);
      setState("ready");
      router.refresh();
      await load(1);
    } catch {
      setState("error");
      setError("Network error while verifying repositories.");
    }
  }

  function pick(fullName) {
    setSelected((current) =>
      current.includes(fullName)
        ? current.filter((name) => name !== fullName)
        : current.length >= 10
          ? current
          : [...current, fullName]
    );
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && state === "idle") load();
  }

  const visible = repos
    .filter((repo) => {
      const q = query.trim().toLowerCase();
      return !q || `${repo.fullName} ${repo.description || ""} ${repo.language || ""}`.toLowerCase().includes(q);
    })
    // Repositories not yet added first: the list exists to let the student act,
    // and burying ten unchecked rows under fifty greyed-out ones is exactly the
    // "why am I looking at all my repos" feeling this panel had.
    .sort((a, b) => {
      const doneA = verifiedSet.has(a.fullName.toLowerCase()) ? 1 : 0;
      const doneB = verifiedSet.has(b.fullName.toLowerCase()) ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      return a.fullName.localeCompare(b.fullName);
    });

  // If we just got a relink requirement, show a re-link banner
  if (state === "relink-required") {
    return (
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          Your GitHub connection needs renewing.
        </p>
        <p className="narrative mt-1">
          Repository verification is paused because the stored token has expired. Renew access to load and confirm your repositories again.
        </p>
        <GithubLinkButton
          label="Renew GitHub access"
          note={undefined}
        />
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={toggle} className="btn-ghost !py-2 text-sm">
        {open ? "Close repository picker" : "Add repositories"}
      </button>
      {open && (
        <div className="mt-3 rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          {state === "loading" && <p className="narrative text-sm">Loading your repositories…</p>}
          {state === "verifying" && <p className="narrative text-sm">Checking your selected repositories with GitHub…</p>}
          {state === "error" && (
            <div>
              <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
              <button type="button" onClick={() => load(nextPage)} className="btn-ghost mt-3 !py-1.5 text-xs">Try again</button>
            </div>
          )}
          {state === "ready" && (
            <>
              {result && (
                <p className="mb-3 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
                  Added {result.added} repositor{result.added === 1 ? "y" : "ies"}.
                  {result.failed.length > 0 && ` ${result.failed.length} could not be confirmed by GitHub.`}
                  {result.activated > 0 && ` ${result.activated} project${result.activated === 1 ? "" : "s"} moved to verified.`}
                </p>
              )}
              <p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                Checking a repository asks GitHub whether you can push to it. Access is recorded only when you press Add repositories.
              </p>
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <label htmlFor="repo-verify-search" className="meta">Find a repository</label>
                <span className="text-[0.72rem] font-semibold" style={{ color: "var(--text-muted)" }} aria-live="polite">
                  {visible.length === repos.length
                    ? `${repos.length} repositor${repos.length === 1 ? "y" : "ies"} loaded`
                    : `${visible.length} of ${repos.length} repositories`}
                </span>
              </div>
              <input
                id="repo-verify-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search owner/repo"
                className="mt-2 w-full rounded-[10px] border px-3 py-2 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
              />
              <ul className="mt-3 max-h-72 divide-y overflow-y-auto" style={{ borderColor: "var(--line)" }}>
                {visible.map((repo) => {
                  const confirmed = verifiedSet.has(repo.fullName.toLowerCase());
                  const checked = confirmed || selected.includes(repo.fullName);
                  const access = repoAccess(repo);
                  const details = [
                    confirmed ? "Already added" : access,
                    repo.language,
                    repo.isPrivate ? "Private" : "Public",
                    repo.pushedAt ? `Last push ${fmtRepoPush(repo.pushedAt)}` : null
                  ].filter(Boolean).join(" · ");
                  return (
                    <li key={repo.fullName} className="flex items-start gap-3 py-2.5">
                      <label className={`flex min-w-0 flex-1 items-start gap-3 ${confirmed ? "opacity-60" : "cursor-pointer"}`}>
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          disabled={confirmed}
                          onChange={() => pick(repo.fullName)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>
                            {repo.fullName}
                          </span>
                          <span className="meta mt-0.5 block normal-case tracking-normal">
                            {details}
                          </span>
                        </span>
                      </label>
                      <a
                        href={repo.htmlUrl || `https://github.com/${repo.fullName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${repo.fullName} on GitHub in a new tab`}
                        className="mt-0.5 shrink-0 text-xs font-semibold"
                        style={{ color: "var(--accent)" }}
                      >
                        ↗
                      </a>
                    </li>
                  );
                })}
                {visible.length === 0 && <li className="narrative py-4 text-sm">No repositories match that search.</li>}
              </ul>
              {hasMore && (
                <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <button
                    type="button"
                    onClick={() => load(nextPage)}
                    className="btn-ghost text-xs"
                  >
                    Load more
                  </button>
                  <span className="meta normal-case tracking-normal">GitHub returns repositories 100 at a time.</span>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                <button
                  onClick={doVerify}
                  disabled={selected.length === 0}
                  className="rounded-[10px] border px-4 py-2 text-sm font-semibold transition active:scale-[0.97]"
                  style={{ borderColor: "var(--line)", color: "var(--primary)" }}
                >
                  Add repositories
                </button>
                <span className="meta normal-case tracking-normal">{selected.length}/10 selected</span>
              </div>
              <p className="mt-2 text-[0.7rem] leading-5" style={{ color: "var(--text-muted)" }}>
                Only repositories your linked GitHub account owns and can push to are listed. Organization and collaborator repositories stay on GitHub — LOOM treats project ownership as authorship.
              </p>
            </>
          )}
          {state === "relink-required" && (
            <GithubLinkButton
              label="Renew GitHub access"
              note={undefined}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* Reads GitHub's own contribution calendar.
   The webhook only knows repositories where it was installed, so a member with
   months of commits can still show an empty grid. This is the one-click repair,
   and the same POST refreshes cached repository metadata. */
export function SyncActivityButton({ lastSyncedAt = null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function sync() {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const res = await fetch("/api/github/sync", { method: "POST" });
      const data = await res.json();
      if (!data?.ok) {
        setError(data?.error?.message || "GitHub could not be reached.");
        return;
      }
      const calendar = data.data?.contributions;
      if (calendar?.ok) {
        setMsg(
          `Read ${calendar.total} contribution${calendar.total === 1 ? "" : "s"} across ${calendar.days} recorded day${calendar.days === 1 ? "" : "s"}.`
        );
      } else if (calendar?.reason === "GRAPHQL_ERROR" || calendar?.reason === "HTTP_401") {
        setError("GitHub did not return a calendar. Renew GitHub access and try again.");
      } else {
        setError("Repositories refreshed, but the contribution calendar could not be read.");
      }
      router.refresh();
    } catch {
      setError("Network error — nothing was refreshed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" onClick={sync} disabled={busy} className="text-xs font-semibold hover:underline disabled:opacity-50" style={{ color: "var(--accent)" }}>
        {busy ? "Reading GitHub…" : "Sync contribution calendar →"}
      </button>
      {lastSyncedAt && !busy && (
        <span className="meta normal-case tracking-normal">
          Calendar read {new Date(lastSyncedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
        </span>
      )}
      {msg && <span className="text-xs" style={{ color: "var(--accent)" }}>{msg}</span>}
      {error && <span role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}

export function ConnectionControls({
  username,
  exportData,
  identityVerified = false,
  oauthConfigured = true,
  tokenStorageReady = true,
  renewNeeded = false
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function disconnect() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/github", { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "Couldn't disconnect. Try again.");
        setBusy(false);
        return;
      }
      setConfirming(false);
      setMsg(
        data.data?.revokedEvidence
          ? `Disconnected. ${data.data.revokedEvidence} proof point${data.data.revokedEvidence === 1 ? "" : "s"} were withdrawn, because they depended on this link.`
          : "Disconnected. Previously recorded activity stays as history."
      );
      router.refresh();
    } catch {
      setMsg("Couldn't reach the server. Try again.");
    }
    setBusy(false);
  }

  return (
    <div className="mt-5">
      {renewNeeded && (
        <div className="mb-4 rounded-xl border p-4" style={{ borderColor: "var(--danger)", background: "var(--bg-muted)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            Your GitHub access needs renewing.
          </p>
          <p className="narrative mt-1">
            Repository verification is paused because the stored token has expired. Renew access to load and confirm your repositories again.
          </p>
          <div className="mt-3">
            {oauthConfigured ? (
              <GithubLinkButton
                label="Renew GitHub access"
                disabled={!tokenStorageReady}
                note={tokenStorageReady ? null : "Unavailable: the server cannot store a token securely right now."}
              />
            ) : (
              <p className="text-xs" style={{ color: "var(--danger)" }}>GitHub linking is not configured for this chapter. Ask an admin.</p>
            )}
          </div>
        </div>
      )}
      {!identityVerified && (
        <div className="mb-4 rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            @{username} is typed in, not verified by GitHub.
          </p>
          <p className="narrative mt-1">
            Until GitHub confirms the link, your handle is only your word for it — and
            so are the repositories you claim. Verify it to have your projects
            confirmed automatically.
          </p>
          <div className="mt-3">
            {oauthConfigured ? (
              <GithubLinkButton
                label="Verify with GitHub"
                disabled={!tokenStorageReady}
                note={
                  tokenStorageReady
                    ? null
                    : "Unavailable: the server cannot store a token securely right now."
                }
              />
            ) : (
              <p className="text-xs" style={{ color: "var(--danger)" }}>
                GitHub linking is not configured for this chapter. Ask an admin.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <a
          href={`https://github.com/${username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost !py-2 text-sm"
        >
          Open GitHub ↗
        </a>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="rounded-[10px] border px-4 py-2 text-sm font-semibold transition active:scale-[0.97]" style={{ borderColor: "var(--line)", color: "var(--danger)" }}>
            Disconnect
          </button>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-2">
            <button type="button" onClick={disconnect} disabled={busy} className="rounded-[10px] px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-50" style={{ background: "var(--danger)" }}>
              {busy ? "Disconnecting…" : "Confirm disconnect"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="btn-ghost !py-2 text-sm">
              Keep linked
            </button>
          </span>
        )}
      </div>
      {msg && <p className="mt-2 text-xs" style={{ color: msg.includes("withdrawn") ? "var(--accent)" : "var(--danger)" }}>{msg}</p>}
      {confirming && (
        <p className="narrative mt-2">
          Disconnecting removes the link, clears the mirrored handle, and deletes any
          repository verifications that depended on it. Recorded activity stays as
          history.
        </p>
      )}

      <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--line)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Export activity</p>
        <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>Download your recorded GitHub activity as JSON — the same rows this page renders.</p>
        <div className="mt-3">
          <ExportGithubButton data={exportData} />
        </div>
      </div>
    </div>
  );
}

/* What the linked token can do on this repository. Returns null when the API
   did not send permission flags, so the row says nothing rather than guessing
   "read" from a missing field. */
function repoAccess(repo) {
  if (repo?.canAdmin == null && repo?.canPush == null) return null;
  if (repo.canAdmin) return "Admin";
  if (repo.canPush) return "Push";
  return "Read";
}

function fmtRepoPush(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}
