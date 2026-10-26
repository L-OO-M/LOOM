import Link from "next/link";
import { proofWeightRows } from "@/lib/profileFolio";

/**
 * The margin of the folio: how the proof score is made, the share studio, and
 * the short list of places a reader can go next. Sticky on desktop, stacked on
 * mobile. No private metrics — everything here is already visible on the card.
 */
export function FolioRail({
  rep = {},
  followers = 0,
  share = null,
  links = [],
  operator = null,
  showScore = true,
  scoreHeading = "Proof score"
}) {
  const rows = proofWeightRows(rep);
  const score = rep.score ?? 0;
  const followerLabel = `${followers} follower${followers === 1 ? "" : "s"}`;
  const endorsementLabel = `${rep.endorsements ?? 0} endorsement${(rep.endorsements ?? 0) === 1 ? "" : "s"}`;

  return (
    <aside className="folio-rail" aria-label="Folio details">
      {showScore && (
        <div className="folio-rail-card">
          <h3>{scoreHeading}</h3>
          <div className="folio-score">
            <strong>{score}</strong>
            <span>{score === 1 ? "point" : "points"}</span>
          </div>
          <p className="folio-score-note">
            {score > 0
              ? `${followerLabel} · ${endorsementLabel}. Every point is read from verified work, not a self-reported number.`
              : "No proof recorded yet. The score starts at zero and only moves when work is verified."}
          </p>
          {rows.length > 0 && (
            <details>
              <summary>How it adds up</summary>
              <ul className="folio-weight-list">
                {rows.map((r) => (
                  <li key={r.key}>
                    <span>{r.label} ×{r.n}</span>
                    <span>+{r.total}</span>
                  </li>
                ))}
                <li>
                  <span>Total</span>
                  <span>{score}</span>
                </li>
              </ul>
            </details>
          )}
        </div>
      )}

      {share}

      {links.length > 0 && (
        <div className="folio-rail-card">
          <h3>Keep exploring</h3>
          <ul className="folio-quick">
            {links.map((item) => (
              <li key={`${item.href}-${item.label}`}>
                {item.external ? (
                  <a href={item.href} target="_blank" rel="noreferrer">
                    <span>{item.label}</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <Link href={item.href} prefetch={false}>
                    <span>{item.label}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {operator}
    </aside>
  );
}
