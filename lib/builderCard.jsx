import { folioNumber } from "@/lib/profileFolio";

export const CARD_PALETTE = {
  field: "#0a1628",
  deep: "#060d18",
  cream: "#f4f1e8",
  gold: "#e8c26a",
  cyan: "#3fd2e0",
  muted: "rgba(244,241,232,0.62)",
  faint: "rgba(244,241,232,0.38)",
  hairline: "rgba(232,194,106,0.34)"
};

const DOMAIN_ACCENT = {
  ai_ml: ["#3fd2e0", "#1d4ed8"],
  web: ["#e8c26a", "#b45309"],
  cybersecurity: ["#fb7185", "#9f1239"],
  dsa: ["#a78bfa", "#4c1d95"],
  blockchain: ["#60a5fa", "#1e3a8a"],
  embedded: ["#34d399", "#065f46"],
  backend: ["#22d3ee", "#0e7490"],
  devops: ["#c084fc", "#581c87"]
};

export function accentFor(domain) {
  return DOMAIN_ACCENT[domain] || ["#e8c26a", "#1e3a8a"];
}

export function initials(name) {
  if (!name) return "?";
  return String(name).trim().split(/\s+/).slice(0, 2)
    .map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export function domainLabel(domain) {
  if (!domain) return "Builder";
  return ({
    ai_ml: "AI / ML", web: "Web Development", cybersecurity: "Cybersecurity",
    dsa: "DSA", blockchain: "Blockchain", embedded: "Embedded & Hardware",
    backend: "Backend", devops: "DevOps"
  })[domain] || domain;
}

/**
 * A builder passport: navy field, woven threads, a wax seal, and a proof
 * ledger. Every value is read from the database; empty stats are omitted.
 */
export function BuilderCard({ data, scale = 1 }) {
  const {
    name, username, domain, bio,
    score = 0, achievements = 0, ossVerified = 0, eventsAttended = 0, followers = 0,
    siteUrl = "", format = "feed"
  } = data || {};
  const P = CARD_PALETTE;
  const [accent, deep] = accentFor(domain);
  const story = format === "story";
  const square = format === "square";
  const s = (n) => Math.round(n * scale);
  const px = (n) => `${n}px`;

  const stats = [
    { label: "REPUTATION", value: score, show: score > 0 },
    { label: "VERIFIED MERGES", value: ossVerified, show: ossVerified > 0 },
    { label: "PROOFS", value: achievements, show: achievements > 0 },
    { label: "EVENTS", value: eventsAttended, show: eventsAttended > 0 },
    { label: "FOLLOWERS", value: followers, show: followers > 0 }
  ].filter((x) => x.show);

  const handle = String(username || "").toUpperCase();
  const link = String(siteUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const bioText = bio ? String(bio).slice(0, story ? 220 : square ? 170 : 150) : "";
  const domainText = domainLabel(domain).toUpperCase();
  const serial = folioNumber(username);

  const threads = (
    <div style={{ position: "absolute", inset: 0, display: "flex" }}>
      {Array.from({ length: 11 }).map((_, i) => (
        <div key={`v-${i}`} style={{
          position: "absolute", top: 0, bottom: 0, left: `${(i + 1) * 8}%`,
          width: 1, background: P.gold, opacity: 0.05
        }} />
      ))}
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={`h-${i}`} style={{
          position: "absolute", left: 0, right: 0, top: `${(i + 1) * 12}%`,
          height: 1, background: P.cream, opacity: 0.035
        }} />
      ))}
    </div>
  );

  const glow = (
    <div style={{
      position: "absolute",
      top: s(-220), right: s(-160), width: s(720), height: s(720),
      background: `radial-gradient(circle, ${accent}38 0%, transparent 68%)`
    }} />
  );

  const frame = (
    <div style={{
      position: "absolute", inset: s(14),
      border: `1px solid ${P.hairline}`, borderRadius: s(20)
    }} />
  );

  const crest = (
    <div style={{
      width: s(38), height: s(38), display: "flex",
      alignItems: "center", justifyContent: "center",
      border: `1.5px solid ${P.gold}`, borderRadius: s(9)
    }}>
      <div style={{
        width: s(21), height: s(21), display: "flex",
        alignItems: "center", justifyContent: "center",
        border: `1.5px solid ${accent}`, borderRadius: s(5)
      }}>
        <div style={{ width: s(7), height: s(7), background: P.gold, borderRadius: s(1.5) }} />
      </div>
    </div>
  );

  const brand = (
    <div style={{ display: "flex", alignItems: "center", gap: px(s(12)) }}>
      {crest}
      <div style={{ display: "flex", flexDirection: "column", gap: px(s(3)) }}>
        <div style={{ fontSize: s(19), letterSpacing: s(5), fontWeight: 700, color: P.gold, lineHeight: 1 }}>
          LOOM
        </div>
        <div style={{ fontSize: s(9), letterSpacing: s(2.5), color: P.faint, lineHeight: 1 }}>
          BUILDER RECORD
        </div>
      </div>
    </div>
  );

  const serialLine = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: px(s(4)) }}>
      <div style={{
        fontSize: s(10), letterSpacing: s(2), color: P.faint,
        border: `1px solid ${P.hairline}`, borderRadius: s(999),
        padding: `${px(s(5))} ${px(s(11))}`
      }}>
        {`FOLIO ${serial}`}
      </div>
      <div style={{ fontSize: s(13), color: P.muted, letterSpacing: s(2) }}>
        {`@${handle}`}
      </div>
    </div>
  );

  function Seal({ size }) {
    return (
      <div style={{ position: "relative", width: s(size), height: s(size), display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: s(999), border: `2px solid ${P.gold}`, opacity: 0.9 }} />
        <div style={{ position: "absolute", inset: s(size * 0.075), borderRadius: s(999), border: `1px solid ${accent}` }} />
        <div style={{
          position: "absolute", inset: s(size * 0.16), borderRadius: s(999),
          background: `linear-gradient(150deg, ${accent}30 0%, rgba(255,255,255,0.04) 100%)`,
          border: `1px solid ${P.hairline}`,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{ fontSize: s(size * 0.26), fontWeight: 700, color: P.cream, letterSpacing: s(1) }}>
            {initials(name)}
          </div>
        </div>
        <div style={{ position: "absolute", bottom: s(size * 0.08), width: s(size * 0.26), height: s(2), background: P.gold }} />
      </div>
    );
  }

  function StatCell({ st, first }) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", gap: px(s(4)),
        padding: `${px(s(11))} ${px(s(15))}`,
        borderLeft: first ? "none" : `1px solid ${P.hairline}`,
        flexGrow: 1, flexBasis: `${s(136)}px`, minWidth: `${s(118)}px`
      }}>
        <div style={{ fontSize: s(10), letterSpacing: s(1.8), color: P.faint }}>{st.label}</div>
        <div style={{ fontSize: s(30), fontWeight: 800, color: P.cream, lineHeight: 1 }}>
          {String(st.value)}
        </div>
      </div>
    );
  }

  const LinkPill = link ? (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: `${px(s(11))} ${px(s(20))}`,
      background: P.gold, borderRadius: s(12),
      color: "#0a1628", fontSize: s(15), fontWeight: 800,
      maxWidth: "100%"
    }}>
      {link}
    </div>
  ) : null;

  const Mantra = (
    <div style={{ fontSize: s(11), letterSpacing: s(3), color: P.faint }}>
      PROOF · PROJECTS · REPUTATION
    </div>
  );

  if (story) {
    const statRows = [];
    for (let i = 0; i < stats.length; i += 2) statRows.push(stats.slice(i, i + 2));
    return (
      <div style={{
        position: "relative", width: "100%", height: "100%",
        display: "flex", flexDirection: "column",
        background: `linear-gradient(160deg, ${deep} 0%, ${P.field} 48%, ${P.deep} 100%)`,
        color: P.cream, fontFamily: "sans-serif", overflow: "hidden"
      }}>
        {glow}
        {threads}
        {frame}
        <div style={{
          display: "flex", flexDirection: "column", height: "100%",
          padding: `${px(s(170))} ${px(s(72))} ${px(s(150))} ${px(s(72))}`,
          gap: px(s(26))
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {brand}
            {serialLine}
          </div>

          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            flexGrow: 1, gap: px(s(26)), textAlign: "center"
          }}>
            <Seal size={230} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: px(s(14)) }}>
              <div style={{
                fontSize: s(76), fontWeight: 700, lineHeight: 1.02,
                letterSpacing: s(-1), maxWidth: s(900)
              }}>
                {name}
              </div>
              <div style={{ fontSize: s(18), letterSpacing: s(5), fontWeight: 700, color: accent }}>
                {domainText}
              </div>
              {bioText && (
                <div style={{ fontSize: s(26), color: P.muted, lineHeight: 1.45, maxWidth: s(840) }}>
                  {bioText}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: px(s(16)) }}>
            {stats.length === 0 ? (
              <div style={{
                fontSize: s(17), color: P.faint, letterSpacing: s(4),
                textAlign: "center", padding: `${px(s(16))} 0`,
                borderTop: `1px solid ${P.hairline}`, borderBottom: `1px solid ${P.hairline}`
              }}>
                BUILDING IN PUBLIC
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${P.hairline}`, borderBottom: `1px solid ${P.hairline}` }}>
                {statRows.map((row, ri) => (
                  <div key={`row-${ri}`} style={{ display: "flex", borderTop: ri === 0 ? "none" : `1px solid ${P.hairline}` }}>
                    {row.map((st, i) => <StatCell key={st.label} st={st} first={i === 0} />)}
                  </div>
                ))}
              </div>
            )}

            {LinkPill}

            <div style={{ display: "flex", justifyContent: "center" }}>{Mantra}</div>
          </div>
        </div>
      </div>
    );
  }

  if (square) {
    return (
      <div style={{
        position: "relative", width: "100%", height: "100%",
        display: "flex", flexDirection: "column",
        background: `linear-gradient(140deg, ${deep} 0%, ${P.field} 55%, ${P.deep} 100%)`,
        color: P.cream, fontFamily: "sans-serif", overflow: "hidden"
      }}>
        {glow}
        {threads}
        {frame}
        <div style={{
          display: "flex", flexDirection: "column", height: "100%",
          padding: px(s(54)), gap: px(s(20))
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {brand}
            {serialLine}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: px(s(34)), flexGrow: 1 }}>
            <Seal size={176} />
            <div style={{ display: "flex", flexDirection: "column", gap: px(s(10)), minWidth: 0 }}>
              <div style={{ fontSize: s(60), fontWeight: 700, lineHeight: 1.02, letterSpacing: s(-1), maxWidth: s(620) }}>
                {name}
              </div>
              <div style={{ fontSize: s(15), letterSpacing: s(3), fontWeight: 700, color: accent }}>
                {domainText}
              </div>
              {bioText && (
                <div style={{ fontSize: s(19), color: P.muted, lineHeight: 1.45, maxWidth: s(640) }}>
                  {bioText}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: px(s(14)) }}>
            {stats.length === 0 ? (
              <div style={{ fontSize: s(15), color: P.faint, letterSpacing: s(2) }}>
                BUILDING IN PUBLIC
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", borderTop: `1px solid ${P.hairline}` }}>
                {stats.map((st, i) => <StatCell key={st.label} st={st} first={i === 0} />)}
              </div>
            )}
            {LinkPill}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      display: "flex", flexDirection: "column",
      background: `linear-gradient(140deg, ${deep} 0%, ${P.field} 55%, ${P.deep} 100%)`,
      color: P.cream, fontFamily: "sans-serif", overflow: "hidden"
    }}>
      {glow}
      {threads}
      {frame}
      <div style={{
        display: "flex", flexDirection: "column", height: "100%",
        padding: px(s(44)), gap: px(s(18))
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          {brand}
          {serialLine}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: px(s(34)), flexGrow: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: px(s(12)), flexGrow: 1, minWidth: 0 }}>
            <div style={{ fontSize: s(11), letterSpacing: s(3), color: P.faint }}>
              {`BUILDER · ${domainText}`}
            </div>
            <div style={{ fontSize: s(66), fontWeight: 700, lineHeight: 1.02, letterSpacing: s(-1), maxWidth: s(720) }}>
              {name}
            </div>
            {bioText && (
              <div style={{ fontSize: s(20), color: P.muted, lineHeight: 1.5, maxWidth: s(650) }}>
                {bioText}
              </div>
            )}
            <div style={{ display: "flex", gap: px(s(16)), marginTop: px(s(8)) }}>
              {LinkPill}
            </div>
          </div>
          <Seal size={196} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: px(s(12)) }}>
          {stats.length === 0 ? (
            <div style={{
              fontSize: s(15), color: P.faint, letterSpacing: s(3),
              paddingTop: px(s(12)), borderTop: `1px solid ${P.hairline}`
            }}>
              BUILDING IN PUBLIC
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", borderTop: `1px solid ${P.hairline}`, borderBottom: `1px solid ${P.hairline}` }}>
              {stats.map((st, i) => <StatCell key={st.label} st={st} first={i === 0} />)}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {Mantra}
            <div style={{ fontSize: s(10), letterSpacing: s(2), color: P.faint }}>LOOM.SH</div>
          </div>
        </div>
      </div>
    </div>
  );
}
