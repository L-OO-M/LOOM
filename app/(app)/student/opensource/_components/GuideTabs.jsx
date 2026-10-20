"use client";

import { useState } from "react";

const STEPS = [
  {
    id: "pick",
    label: "Pick",
    title: "Pick one issue, not the whole repo",
    body: "Read the issue and its comments before you write code. A maintainer may already have a plan, or the issue may be stale.",
    bullets: [
      "Start with an issue labelled good first issue or help wanted.",
      "Comment that you are taking it and ask any blocking question.",
      "If the repo has no starter labels, read its CONTRIBUTING file and ask where help is needed."
    ],
    command: `gh issue list --repo owner/repo --label "good first issue" --state open`
  },
  {
    id: "prepare",
    label: "Prepare",
    title: "Fork, branch, reproduce",
    body: "Work on a branch, never on main. Reproduce the bug or read the failing test before changing anything.",
    bullets: [
      "Fork the repo and clone your fork.",
      "Add the original repo as upstream so you can rebase later.",
      "Follow the repo's setup and test commands exactly."
    ],
    command: `gh repo fork owner/repo --clone --remote
cd repo
git remote add upstream https://github.com/owner/repo.git
git checkout -b fix/short-description`
  },
  {
    id: "ship",
    label: "Ship",
    title: "Keep the pull request small",
    body: "One issue, one pull request. Explain what changed and how you tested it; link the issue with 'Closes #123'.",
    bullets: [
      "Match the repo's formatting and commit style.",
      "Run the project's tests and linter locally.",
      "Open a draft PR early if you want direction; mark it ready when tests pass."
    ],
    command: `git add -A
git commit -m "Fix: short description"
git push -u origin fix/short-description
gh pr create --fill --base main`
  },
  {
    id: "claim",
    label: "Claim",
    title: "Claim it in LOOM",
    body: "Paste the pull request or issue URL below. Merged PRs are verified automatically when the repository webhook is connected; reviews are verified from the signed review delivery. Everything else stays claimed until an admin checks it.",
    bullets: [
      "Use the PR URL, not your fork's compare page.",
      "An issue URL counts as an issue record, not a pull request.",
      "Claiming twice is safe: LOOM stores one canonical URL per contribution."
    ],
    command: `https://github.com/owner/repo/pull/123`
  }
];

export default function GuideTabs() {
  const [active, setActive] = useState(STEPS[0].id);
  const step = STEPS.find((s) => s.id === active) || STEPS[0];

  return (
    <div className="mt-4 rounded-[var(--radius-xl)] border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <div className="seg m-3" role="tablist" aria-label="Contribution guide steps">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`guide-tab-${s.id}`}
            aria-selected={active === s.id}
            aria-controls={`guide-panel-${s.id}`}
            aria-pressed={active === s.id}
            onClick={() => setActive(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div
        className="border-t px-4 pb-5 pt-4"
        role="tabpanel"
        id={`guide-panel-${step.id}`}
        aria-labelledby={`guide-tab-${step.id}`}
        style={{ borderColor: "var(--line)" }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{step.title}</p>
        <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{step.body}</p>
        <ul className="mt-3 space-y-1.5">
          {step.bullets.map((b) => (
            <li key={b} className="flex gap-2 text-xs leading-5" style={{ color: "var(--text)" }}>
              <span aria-hidden="true" style={{ color: "var(--accent)" }}>—</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <pre
          className="mt-3 overflow-x-auto rounded-[var(--radius-md)] border p-3 font-mono text-[11px] leading-5"
          style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
        >
          <code>{step.command}</code>
        </pre>
      </div>
    </div>
  );
}
