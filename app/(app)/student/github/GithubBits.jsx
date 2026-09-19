"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GithubConnectForm } from "@/components/actions";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import { StatusPill } from "@/components/loom/primitives";
import ExportGithubButton from "./ExportButton";

/* Client islands for the GitHub workspace. The page stays a server
   component; only the smallest interactive leaves live here. */

export function GithubTabs({ items, repos }) {
  const [tab, setTab] = useState("activity");
  return (
    <div>
      <div className="seg" role="tablist" aria-label="Building activity views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "activity"}
          aria-pressed={tab === "activity"}
          onClick={() => setTab("activity")}
        >
          Recent activity
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "repos"}
          aria-pressed={tab === "repos"}
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

export function ConnectionControls({ username, exportData }) {
  const router = useRouter();
  const [relink, setRelink] = useState(false);
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
      router.refresh();
    } catch {
      setMsg("Couldn't reach the server. Try again.");
    }
    setBusy(false);
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        <a
          href={`https://github.com/${username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost !py-2 text-sm"
        >
          Open GitHub ↗
        </a>
        <button type="button" onClick={() => setRelink((v) => !v)} className="btn-ghost !py-2 text-sm" aria-expanded={relink}>
          {relink ? "Close relink" : "Relink"}
        </button>
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
      {msg && <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      {confirming && <p className="narrative mt-2">Disconnecting removes the link and clears the mirrored handle. Recorded activity stays as history.</p>}

      {relink && (
        <div className="mt-4 max-w-sm rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Link a different username</p>
          <GithubConnectForm initial="" submitLabel="Save username" />
        </div>
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
