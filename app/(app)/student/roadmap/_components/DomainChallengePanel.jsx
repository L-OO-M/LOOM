import Link from "next/link";
import { StatusPill } from "@/components/loom/primitives";
import { domainLabel } from "@/lib/domains";

/**
 * The challenge panel beside the roadmap.
 *
 * Challenges used to be a peer tab, which meant the page had no idea which
 * roadmap the member was reading and always opened the primary track. Putting
 * the panel on the roadmap gives it the one fact it needs — the domain — and
 * makes the next step ("learned enough? prove it") visible without another
 * navigation decision.
 *
 * The emblem is inline SVG, not an image: it inherits the theme accent, works
 * in light and dark, and needs no network request.
 */

const EMBLEMS = {
  web: (
    <>
      <path d="M34 34 20 48l14 14" />
      <path d="M62 34l14 14-14 14" />
      <path d="M54 26 42 70" />
    </>
  ),
  ai_ml: (
    <>
      <path d="M30 66 48 28l20 36" />
      <path d="M30 66h38" />
      <circle cx="48" cy="28" r="5" />
      <circle cx="30" cy="66" r="5" />
      <circle cx="68" cy="66" r="5" />
    </>
  ),
  cybersecurity: (
    <>
      <path d="M48 20 68 28v16c0 14-9 23-20 28-11-5-20-14-20-28V28z" />
      <path d="m39 48 7 7 13-15" />
    </>
  ),
  dsa: (
    <>
      <circle cx="48" cy="26" r="6" />
      <circle cx="30" cy="62" r="6" />
      <circle cx="66" cy="62" r="6" />
      <path d="M48 32v10M43 42 33 56M53 42l10 14" />
    </>
  ),
  blockchain: (
    <>
      <path d="M34 36 48 28l14 8v16l-14 8-14-8z" />
      <path d="M48 28v32M34 36l14 8 14-8" />
      <path d="M26 52 20 56v10l10 6" />
    </>
  ),
  embedded: (
    <>
      <rect x="32" y="32" width="32" height="32" rx="4" />
      <path d="M40 32V22M48 32V22M56 32V22M40 74V64M48 74V64M56 74V64M32 40H22M32 48H22M32 56H22M74 40H64M74 48H64M74 56H64" />
    </>
  ),
  backend: (
    <>
      <rect x="26" y="24" width="44" height="18" rx="4" />
      <rect x="26" y="50" width="44" height="18" rx="4" />
      <path d="M35 33h.01M35 59h.01" />
    </>
  ),
  devops: (
    <>
      <path d="M26 48c0-8 6-14 14-14 6 0 10 3 13 8 3-5 7-8 13-8 8 0 14 6 14 14s-6 14-14 14c-6 0-10-3-13-8-3 5-7 8-13 8-8 0-14-6-14-14z" />
    </>
  )
};

function ChallengeEmblem({ domain }) {
  return (
    <svg
      viewBox="0 0 96 96"
      role="img"
      aria-label={`${domainLabel(domain)} challenge emblem`}
      className="size-16 shrink-0"
      style={{ color: "var(--accent)" }}
    >
      <circle
        cx="48"
        cy="48"
        r="42"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="1.5"
        strokeDasharray="4 5"
      />
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {EMBLEMS[domain] || EMBLEMS.web}
      </g>
    </svg>
  );
}

function CountRow({ label, value }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="font-mono text-sm tabular-nums" style={{ color: "var(--text)" }}>{value}</span>
    </li>
  );
}

export function DomainChallengePanel({ domain, overview, nudge, society }) {
  const practice = overview?.practice;
  const debug = overview?.debug?.items || [];
  const contests = overview?.contests?.items || [];
  const repos = overview?.opensource?.items || [];
  const total = (overview?.debug?.total || 0) + (overview?.contests?.total || 0)
    + (overview?.opensource?.total || 0) + (practice ? 1 : 0);
  const hub = `/student/challenges?domain=${encodeURIComponent(domain)}`;

  return (
    <aside
      aria-labelledby="domain-challenges-title"
      className="h-fit rounded-3xl border p-5 lg:sticky lg:top-6"
      style={{
        borderColor: "color-mix(in srgb, var(--accent) 26%, var(--line))",
        background:
          "linear-gradient(160deg, color-mix(in srgb, var(--accent) 8%, var(--bg-elevated)), var(--bg-elevated))"
      }}
    >
      <div className="flex items-center gap-3">
        <ChallengeEmblem domain={domain} />
        <div className="min-w-0">
          <p className="meta">Challenges / {domainLabel(domain)}</p>
          <h2
            id="domain-challenges-title"
            className="mt-1 text-lg font-semibold leading-tight"
            style={{ color: "var(--text)" }}
          >
            Prove this track.
          </h2>
        </div>
      </div>

      <p className="narrative mt-3 text-sm leading-6">
        {nudge?.body || "Pick something real from this track and make it work."}
      </p>

      <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
        <CountRow label="Society challenge" value={society?.hasFolder ? "open" : "repo"} />
        <CountRow label="Curated repos" value={repos.length} />
        <CountRow label="Debug tasks" value={debug.length} />
        <CountRow label="Contests" value={contests.length} />
      </ul>

      <Link href={hub} prefetch={false} className="btn-ink mt-4 w-full justify-center !py-2.5 text-sm">
        Open {domainLabel(domain)} challenges &rarr;
      </Link>
      <p className="meta mt-2">{total} live item{total === 1 ? "" : "s"} in this track</p>

      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Society challenge</p>
          <StatusPill>{society?.folder ? "one folder" : "repo"}</StatusPill>
        </div>
        <p className="narrative mt-1.5 text-xs leading-5">
          {society?.hasFolder
            ? <>Fork <code>{society.repo}</code>, fix one bug in <code>{society.folder}</code>, then submit the fork link.</>
            : <>Fork <code>{society?.repo}</code>, pick the closest project, then submit the fork link.</>}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold">
          <a
            href={society?.folderUrl || society?.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Open folder ↗
          </a>
          <a
            href={society?.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            Repository ↗
          </a>
          <Link href={`${hub}#society`} prefetch={false} className="hover:underline" style={{ color: "var(--text-muted)" }}>
            Submit a fork
          </Link>
        </div>
      </div>

      {repos.length > 0 ? (
        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Open source, this track</p>
          <ul className="mt-2 space-y-2">
            {repos.slice(0, 2).map((item) => (
              <li key={item.id} className="text-xs leading-5">
                <a
                  href={item.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold hover:underline"
                  style={{ color: "var(--text)" }}
                >
                  {item.title}
                </a>
                {item.issues > 0 ? (
                  <span style={{ color: "var(--text-muted)" }}> · {item.issues} starter issues</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
