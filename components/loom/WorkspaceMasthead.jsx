import Image from "next/image";

export function WorkspaceMasthead({
  kicker,
  title,
  lede,
  meta,
  stats = [],
  art,
  artAlt = "",
  aside,
  actions,
  tone = "paper",
  className = "",
  children
}) {
  return (
    <header className={`wsm wsm--${tone} ${className}`}>
      <div className="wsm-copy">
        {kicker && <p className="wsm-kicker">{kicker}</p>}
        <h1 className="wsm-title">{title}</h1>
        {lede && <p className="wsm-lede">{lede}</p>}
        {meta && <p className="wsm-meta">{meta}</p>}
        {actions && <div className="wsm-actions">{actions}</div>}
        {children}
      </div>
      {(art || stats.length > 0 || aside) && (
        <div className="wsm-side">
          {art && (
            <div className="wsm-art">
              <Image src={art} alt={artAlt} fill sizes="(max-width: 899px) 100vw, 320px" />
            </div>
          )}
          {stats.length > 0 && (
            <div className="wsm-stats" aria-label="At a glance">
              {stats.map((s) => (
                <div key={s.label} className="wsm-stat">
                  <p className="wsm-stat-value">
                    {s.value}
                    {s.unit && <span>{s.unit}</span>}
                  </p>
                  <p className="wsm-stat-label">{s.label}</p>
                </div>
              ))}
            </div>
          )}
          {aside}
        </div>
      )}
    </header>
  );
}

export function WorkspaceSection({ index, title, note, action, children, className = "" }) {
  return (
    <section className={`wss ${className}`}>
      <header className="wss-head">
        {index && <span className="wss-index">{index}</span>}
        <div className="wss-heading">
          <h2>{title}</h2>
          {note && <p>{note}</p>}
        </div>
        {action && <div className="wss-action">{action}</div>}
      </header>
      {children}
    </section>
  );
}

export function WorkspaceEmpty({ title, body, action }) {
  return (
    <div className="wss-empty">
      <p className="wss-empty-title">{title}</p>
      {body && <p className="wss-empty-body">{body}</p>}
      {action && <div className="wss-empty-action">{action}</div>}
    </div>
  );
}
