import { domainLabel } from "@/lib/domains";
import { LEVEL_LABEL } from "@/lib/oss-match";

export function gfiHref(owner, repo) {
  return `https://github.com/${owner}/${repo}/issues?q=is:open+label:"good first issue"`;
}

function compact(n) {
  const value = Number(n) || 0;
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export default function RepoCard({ repo, claimHref, reasons = [], compactHeader = false }) {
  const gfi = Number(repo.good_first_issues) || 0;
  return (
    <li
      className="card-sheen flex min-w-0 flex-col rounded-[var(--radius-xl)] border p-4"
      style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <a
          href={repo.github_repo_url}
          target="_blank"
          rel="noreferrer"
          aria-label={`${repo.owner}/${repo.repo_name} on GitHub (opens in a new tab)`}
          className="min-w-0 break-words font-mono text-sm font-semibold hover:underline"
          style={{ color: "var(--text)" }}
        >
          {repo.owner}/{repo.repo_name}
        </a>
        <span
          className="mono-tag shrink-0 rounded-full border px-2 py-0.5 text-[10px]"
          style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
        >
          {LEVEL_LABEL[repo.difficulty] || repo.difficulty}
        </span>
      </div>

      <p className="mt-1 line-clamp-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
        {repo.description || `${domainLabel(repo.primary_domain)} · ${repo.language || "mixed language"}`}
      </p>

      <div className="mono-tag mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
          {domainLabel(repo.primary_domain)}
        </span>
        {repo.language && (
          <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
            {repo.language}
          </span>
        )}
        {repo.is_private && (
          <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
            Private
          </span>
        )}
      </div>

      {reasons.length > 0 && !compactHeader && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Why this repository was recommended">
          {reasons.map((reason) => (
            <li
              key={reason}
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--wash)", color: "var(--accent)" }}
            >
              {reason}
            </li>
          ))}
        </ul>
      )}

      <p className="mono-tag mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>★ {compact(repo.stars)}</span>
        <span>{gfi > 0 ? `${gfi} good first issue${gfi === 1 ? "" : "s"}` : "No labelled starter issues"}</span>
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-4">
        <a
          href={gfiHref(repo.owner, repo.repo_name)}
          target="_blank"
          rel="noreferrer"
          aria-label={`${gfi > 0 ? "Find a good first issue" : "Open the issue list"} in ${repo.owner}/${repo.repo_name} (opens in a new tab)`}
          className="mono-tag rounded-full border px-2.5 py-1 hover:bg-[var(--wash)]"
          style={{ borderColor: "var(--line)", color: "var(--accent)" }}
        >
          {gfi > 0 ? "Find an issue →" : "Browse issues →"}
        </a>
        <a href={repo.github_repo_url} target="_blank" rel="noreferrer" className="mono-tag hover:underline" style={{ color: "var(--text-muted)" }}>
          Open repo →
        </a>
        <a href={claimHref} className="mono-tag ml-auto font-semibold hover:underline" style={{ color: "var(--accent)" }}>
          Claim contribution
        </a>
      </div>
    </li>
  );
}
