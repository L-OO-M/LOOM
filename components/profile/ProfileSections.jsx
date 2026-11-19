import Link from "next/link";
import { monthYear } from "@/lib/profileFolio";

/**
 * The records every profile surface shows: the proof ledger, what the member is
 * building, the activity LOOM synced, the accounts they link elsewhere, and the
 * skills people vouch for.
 *
 * Server component — the public page must stay crawlable and the in-app page
 * should not ship a client bundle just to draw a list.
 *
 * Two shapes are accepted for the ledger so the public page and the older
 * in-app page cannot drift:
 *   - `proofItems` from lib/proof.js (the shared contract), or
 *   - legacy `achievements` + `ossMerges` rows.
 * Verified items are always rendered before unverified ones, and an unverified
 * row is labelled "Awaiting review" — never shown as proven.
 */

function statusLabel(status) {
  const value = String(status || "").trim();
  if (!value) return null;
  return value.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

function repoHref(project) {
  if (!project) return null;
  if (project.repo_url) return project.repo_url;
  if (project.repo_full_name) return `https://github.com/${project.repo_full_name}`;
  return null;
}

function legacyLedger({ achievements, ossMerges, proofAction }) {
  const items = achievements.map((a) => ({
    id: `achievement-${a.id}`,
    kind: "achievement",
    label: a.badge_name || (a.source_type ? `${a.source_type} achievement` : "Achievement"),
    detail: "Achievement",
    href: null,
    // A badge row only exists because a lead issued it through the verification
    // page, so it is a human decision already — not an unverified claim.
    verified: true,
    source: "LOOM",
    at: a.earned_at,
    action: proofAction ? proofAction(a) : null
  }));
  for (const m of ossMerges) {
    items.push({
      id: `merge-${m.id}`,
      kind: "merge",
      label: m.title || m.repo || "Verified contribution",
      detail: "Verified merge",
      href: m.pr_url || m.url || m.repo_url || null,
      verified: true,
      source: "GitHub",
      at: m.merged_at || m.created_at
    });
  }
  return items;
}

function ledgerTime(item) {
  const time = Date.parse(item?.at || "");
  return Number.isNaN(time) ? 0 : time;
}

export function ProfileSections({
  achievements = [],
  ossMerges = [],
  proofItems = null,
  proofCounts = [],
  projects = null,
  latestProject = null,
  projectHref = null,
  proofAction = null,
  proofFooter = null,
  endorsementFooter = null,
  showEndorsements = true,
  skills = [],
  endorsementCount = null,
  activity = null,
  links = []
}) {
  const ledgerItems = Array.isArray(proofItems) ? proofItems : legacyLedger({ achievements, ossMerges, proofAction });
  const ledger = [...ledgerItems].sort((a, b) => {
    if (!!b.verified !== !!a.verified) return b.verified ? 1 : -1;
    return ledgerTime(b) - ledgerTime(a);
  });
  const projectItems = Array.isArray(projects) && projects.length > 0 ? projects : null;
  const project = latestProject?.[0] || latestProject || null;
  const endorsementTotal = endorsementCount ?? skills.length;
  const elsewhere = Array.isArray(links) ? links.filter((l) => l?.href) : [];

  return (
    <>
      <section aria-labelledby="proof-heading" className="folio-section">
        <div className="folio-section-head">
          <h2 id="proof-heading">Proof</h2>
          {proofCounts.length > 0 && (
            <span className="folio-section-note">{proofCounts.join(" · ")}</span>
          )}
        </div>

        {ledger.length === 0 ? (
          <p className="folio-empty">
            No verified work recorded yet. Proof lands here when it is earned,
            not when it is claimed.
          </p>
        ) : (
          <ol className="folio-ledger">
            {ledger.map((item) => (
              <li key={item.id} className="folio-ledger-row">
                <span className="folio-ledger-date">{monthYear(item.at)}</span>
                <div>
                  <p className="folio-ledger-title">
                    {item.href ? (
                      <a href={item.href} target="_blank" rel="noopener noreferrer">{item.label}</a>
                    ) : item.label}
                  </p>
                  <div className="folio-ledger-meta">
                    <span>{item.detail || item.source || item.kind}</span>
                    {item.verified ? (
                      <span className="folio-verified">✓ Verified</span>
                    ) : (
                      <span className="folio-pending">Awaiting review</span>
                    )}
                    {item.action}
                    {item.href && !item.action ? (
                      <a href={item.href} target="_blank" rel="noopener noreferrer" className="folio-ledger-action">
                        Open ↗
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        {proofFooter}
      </section>

      <section aria-labelledby="building-heading" className="folio-section">
        <div className="folio-section-head">
          <h2 id="building-heading">Building</h2>
          <span className="folio-section-note">
            {projectItems ? `${projectItems.length} project${projectItems.length === 1 ? "" : "s"}` : "On the board"}
          </span>
        </div>
        {projectItems ? (
          <ul className="folio-project-list">
            {projectItems.slice(0, 6).map((p) => {
              const href = repoHref(p);
              const status = statusLabel(p.status);
              return (
                <li key={p.id} className="folio-project-row">
                  {projectHref ? (
                    <Link href={projectHref(p)} prefetch={false} className="folio-project-title">
                      {p.title}
                    </Link>
                  ) : (
                    <span className="folio-project-title">{p.title}</span>
                  )}
                  <span className="folio-project-meta">
                    {status ? <span>{status}</span> : null}
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="folio-project-link">
                        Repo ↗
                      </a>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : project ? (
          <div className="folio-project">
            {projectHref ? (
              <Link href={projectHref(project)} prefetch={false} className="folio-project-title">
                {project.title}
              </Link>
            ) : (
              <span className="folio-project-title">{project.title}</span>
            )}
          </div>
        ) : (
          <p className="folio-empty">
            No project on the board yet — the work here is still in progress.
          </p>
        )}
      </section>

      {activity ? (
        <section aria-labelledby="activity-heading" className="folio-section">
          <div className="folio-section-head">
            <h2 id="activity-heading">Activity</h2>
            <span className="folio-section-note">Synced, not typed</span>
          </div>
          {activity}
        </section>
      ) : null}

      {elsewhere.length > 0 ? (
        <section aria-labelledby="elsewhere-heading" className="folio-section">
          <div className="folio-section-head">
            <h2 id="elsewhere-heading">Elsewhere</h2>
            <span className="folio-section-note">{elsewhere.length} linked account{elsewhere.length === 1 ? "" : "s"}</span>
          </div>
          <ul className="folio-elsewhere">
            {elsewhere.map((link) => (
              <li key={link.key || link.href}>
                <a href={link.href} target="_blank" rel="noopener noreferrer">
                  <span className="folio-elsewhere-label">{link.label}</span>
                  {link.note ? <span className="folio-elsewhere-note">{link.note}</span> : null}
                  <span aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="known-for-heading" className="folio-section">
        <div className="folio-section-head">
          <h2 id="known-for-heading">Known for</h2>
          <span className="folio-section-note">
            {showEndorsements ? `${endorsementTotal} endorsement${endorsementTotal === 1 ? "" : "s"}` : "Hidden by member"}
          </span>
        </div>

        {!showEndorsements ? (
          <p className="folio-empty">This member has hidden their endorsements.</p>
        ) : skills.length === 0 ? (
          <p className="folio-empty">
            No endorsements yet — vouch for a skill you have seen in action.
          </p>
        ) : (
          <ul className="folio-skills">
            {skills.map((s, i) => (
              <li key={s.skill} className="folio-skill" data-top={i < 3 ? "true" : "false"}>
                <span>{s.skill}</span>
                <strong>×{s.n}</strong>
              </li>
            ))}
          </ul>
        )}
        {endorsementFooter}
      </section>
    </>
  );
}
