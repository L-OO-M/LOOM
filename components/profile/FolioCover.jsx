import { PersonAvatar } from "@/components/loom/PersonAvatar";

/**
 * The cover of a builder folio. Server-rendered so the public record is in the
 * first HTML response (and crawlable). The avatar is the wax seal; the name is
 * set in the display face; every other line is monospaced record-keeping.
 */
export function FolioCover({
  name,
  username,
  avatarUrl = null,
  domain = "Builder",
  location = "",
  bio = "",
  isGuide = false,
  folio = "000",
  actions = null,
  note = null,
  emptyBio = "No bio yet — this builder hasn't written one.",
  headingLevel = "h1",
  className = ""
}) {
  const Heading = headingLevel || "h1";
  return (
    <div className={`folio-cover ${className}`.trim()}>
      <div className="folio-cover-grid" aria-hidden="true" />
      <div className="folio-cover-main">
        <div className="folio-seal" aria-hidden="true">
          <PersonAvatar name={name} avatarUrl={avatarUrl} size={64} variant="accent" />
        </div>

        <div className="folio-identity">
          <p className="folio-index">
            <span>Builder record</span>
            <span aria-hidden="true">·</span>
            <strong>Folio {folio}</strong>
          </p>

          <Heading className="folio-name">{name}</Heading>

          <div className="folio-handle-row">
            <span className="folio-handle">@{username}</span>
            <span className="folio-stamp">{domain}</span>
            {isGuide && <span className="folio-stamp is-guide">Guide</span>}
            {location && <span className="folio-loc">{location}</span>}
          </div>

          {bio ? (
            <p className="folio-bio">{bio}</p>
          ) : (
            <p className="folio-bio is-empty">{emptyBio}</p>
          )}

          {actions ? <div className="folio-actions">{actions}</div> : null}
          {note ? <div style={{ marginTop: "0.9rem" }}>{note}</div> : null}
        </div>
      </div>
    </div>
  );
}
