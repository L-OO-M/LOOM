"use client";

import { useState } from "react";

/**
 * Ingestion diagnostics for /student/github.
 *
 * "My numbers are zero" has three completely different causes -- ingestion is
 * switched off, deliveries are not arriving, or activity simply has not been
 * attributed to this member -- and each needs a different fix. This panel names
 * which one applies instead of leaving the member to guess. Every value is a
 * real aggregate; nothing here is decorative.
 */
export function GithubDiagnostics({ diagnostics }) {
  const [open, setOpen] = useState(false);
  const d = diagnostics || {};
  const repos = d.repos || [];

  // Ordered by how much they block the member, most severe first.
  //
  // "Deliveries arriving" is judged on the RECENT window only. An all-time
  // total is misleading: historical seed/test rows make an install with zero
  // live deliveries look healthy, which is exactly backwards -- it told a user
  // "deliveries arriving, but none are yours" when not a single real delivery
  // had ever been received.
  let verdict;
  let tone;
  let detail;
  const stale = d.totalEvents > 0 && d.events24h === 0;
  if (d.paused) {
    verdict = "Ingestion is paused";
    tone = "warn";
    detail = "The chapter has github_integration switched off, so deliveries are acknowledged and then discarded. An admin can turn it on at /admin/flags.";
  } else if (!d.username) {
    verdict = "No GitHub username linked yet";
    tone = "warn";
    detail = "Link your exact GitHub handle below. Activity is matched to you by that username — there is no OAuth login, so the spelling has to be exact.";
  } else if (d.events24h === 0) {
    verdict = "No deliveries have arrived recently";
    tone = "danger";
    detail = d.totalEvents === 0
      ? "The webhook endpoint is reachable and signature verification passes, but nothing has ever been sent. A webhook only receives events from the repository it is configured on — if it sits on the society repository, your personal pushes will never reach LOOM. Add it at your GitHub account level (Settings -> Webhooks -> Repositories), then push a commit and check Recent Deliveries."
      : `No delivery in the last 24 hours (${d.totalEvents} older row${d.totalEvents === 1 ? "" : "s"} on file). Check GitHub -> Settings -> Webhooks -> Recent Deliveries and read the Response body of the newest delivery: a 401 means the secret does not match, a 404 means the URL is wrong.`;
  } else if (d.myActivityRows === 0) {
    verdict = "Deliveries arriving, but none are yours";
    tone = "warn";
    detail = `${d.events24h} delivery in the last 24 hours. Activity is attributed by matching the pushing GitHub username against linked accounts. Check the repositories listed below and confirm you pushed with the handle you linked.`;
  } else {
    verdict = "Working";
    tone = "ok";
    detail = "Events are arriving and being attributed to your account.";
  }

  const toneStyle = {
    ok: { fg: "var(--success)", bg: "color-mix(in srgb, var(--success) 8%, var(--bg-elevated))" },
    warn: { fg: "var(--warn)", bg: "color-mix(in srgb, var(--warn) 8%, var(--bg-elevated))" },
    danger: { fg: "var(--danger)", bg: "color-mix(in srgb, var(--danger) 8%, var(--bg-elevated))" }
  }[tone];

  const rows = [
    { k: "Ingestion switch", v: d.paused ? "Paused" : "Live" },
    { k: "Deliveries received (all)", v: String(d.totalEvents ?? 0) },
    { k: "Deliveries in last 24h", v: String(d.events24h ?? 0) },
    { k: "Last delivery", v: d.lastEventAt ? new Date(d.lastEventAt).toLocaleString() : "never" },
    { k: "Attributed to you", v: `${d.myCommits ?? 0} commits · ${d.myPrs ?? 0} PRs` },
    { k: "Unattributed events", v: String(d.unlinkedActors ?? 0) }
  ];

  return (
    <section
      className="rounded-2xl border p-4"
      style={{ borderColor: toneStyle.fg, background: toneStyle.bg }}
      aria-label="Ingestion diagnostics"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ background: toneStyle.fg }} aria-hidden="true" />
        <strong className="text-sm" style={{ color: "var(--text)" }}>{verdict}</strong>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto text-xs font-semibold"
          style={{ color: toneStyle.fg }}
          aria-expanded={open}
        >
          {open ? "Hide details" : "Why?"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-sm leading-6" style={{ color: "var(--text-muted)" }}>{detail}</p>
          <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {rows.map((r) => (
              <div key={r.k} className="flex items-baseline justify-between gap-3 border-b py-1" style={{ borderColor: "var(--line)" }}>
                <dt style={{ color: "var(--text-muted)" }}>{r.k}</dt>
                <dd className="text-right font-mono" style={{ color: "var(--text)" }}>{r.v}</dd>
              </div>
            ))}
          </dl>

          {repos.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
                Repositories that have sent deliveries
              </p>
              <ul className="mt-1.5 space-y-1">
                {repos.map((r) => (
                  <li key={r.repo} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate" style={{ color: "var(--text)" }}>{r.repo}</span>
                    <span className="mono-tag shrink-0">{r.n} events · {new Date(r.lastAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>
            Server-side check without the UI: <code>node load/verify-webhook.js --ping</code>
          </p>
        </div>
      )}
    </section>
  );
}
