import Link from "next/link";
import { monthYear } from "@/lib/profileFolio";

/**
 * The three records every profile surface shows: what they are building, the
 * proof they have earned, and what people vouch for. Server component — the
 * public page must stay crawlable and the in-app page should not ship a client
 * bundle just to draw a list.
 *
 * `proofAction` and the two footers are the only per-surface differences.
 */
export function ProfileSections({
  achievements = [],
  ossMerges = [],
  proofCounts = [],
  skills = [],
  endorsementCount = null,
  latestProject = null,
  projectHref = null,
  proofAction = null,
  proofFooter = null,
  endorsementFooter = null,
  showEndorsements = true
}) {
  const project = latestProject?.[0] || null;
  const ledgerCount = achievements.length + ossMerges.length;
  const endorsementTotal = endorsementCount ?? skills.length;

  return (
    <>
      <section aria-labelledby="building-heading" className="folio-section">
        <div className="folio-section-head">
          <h2 id="building-heading">Building</h2>
          <span className="folio-section-note">Latest project</span>
        </div>
        {project ? (
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

      <section aria-labelledby="proof-heading" className="folio-section">
        <div className="folio-section-head">
          <h2 id="proof-heading">The proof</h2>
          {proofCounts.length > 0 && (
            <span className="folio-section-note">{proofCounts.join(" · ")}</span>
          )}
        </div>

        {ledgerCount === 0 ? (
          <p className="folio-empty">
            No badges or verified merges yet. Proof lands here when it is earned,
            not when it is claimed.
          </p>
        ) : (
          <ol className="folio-ledger">
            {achievements.map((a) => (
              <li key={`achievement-${a.id}`} className="folio-ledger-row">
                <span className="folio-ledger-date">{monthYear(a.earned_at)}</span>
                <div>
                  <p className="folio-ledger-title">
                    {a.badge_name || (a.source_type ? `${a.source_type} achievement` : "Achievement")}
                  </p>
                  <div className="folio-ledger-meta">
                    <span>Achievement</span>
                    {proofAction && <span className="folio-ledger-action">{proofAction(a)}</span>}
                  </div>
                </div>
              </li>
            ))}
            {ossMerges.map((m) => (
              <li key={`merge-${m.id}`} className="folio-ledger-row">
                <span className="folio-ledger-date">{monthYear(m.merged_at || m.created_at)}</span>
                <div>
                  <p className="folio-ledger-title">{m.title || m.repo || "Verified contribution"}</p>
                  <div className="folio-ledger-meta">
                    <span>Verified merge</span>
                    {m.url && (
                      <a href={m.url} target="_blank" rel="noreferrer" className="folio-ledger-action">
                        View PR ↗
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        {proofFooter}
      </section>

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
