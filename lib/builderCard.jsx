// Shared builder-card renderer.
//
// Used by both the OG endpoint (next/og ImageResponse) and the in-page live
// preview, so what a member previews is exactly what a recipient sees. These
// must stay in sync — a preview that differs from the shared image is worse
// than no preview.
//
// Palette is the landing language: navy field, gold rule, cyan glow, cream
// type. Accent rotates per domain so an Embedded card does not look like an AI
// card. Everything rendered is a real value from the database -- no invented
// metrics, no "join 10,000 builders", no urgency. The card's job is to show
// what someone actually proved.

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
 * @param {object} data  { name, username, domain, bio, score, achievements,
 *                         ossVerified, eventsAttended, followers, siteUrl, format }
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

  // Only show what is actually true. An empty stat is worse than a missing one.
  const stats = [
    { label: "REPUTATION", value: score, show: score > 0 },
    { label: "VERIFIED MERGES", value: ossVerified, show: ossVerified > 0 },
    { label: "PROOFS", value: achievements, show: achievements > 0 },
    { label: "EVENTS", value: eventsAttended, show: eventsAttended > 0 },
    { label: "FOLLOWERS", value: followers, show: followers > 0 }
  ].filter((x) => x.show);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: story ? s(56) : s(46),
        background: `linear-gradient(140deg, ${deep} 0%, ${P.field} 55%, ${P.deep} 100%)`,
        color: P.cream,
        fontFamily: "sans-serif",
        overflow: "hidden"
      }}
    >
      {/* Glow + hairline frame. The frame is the "card" metaphor; no drop shadow
          survives PNG flattening, so depth comes from the gradient. */}
      <div style={{
        position: "absolute",
        top: -180, right: -120, width: 620, height: 620,
        background: `radial-gradient(circle, ${accent}38 0%, transparent 68%)`
      }} />
      <div style={{
        position: "absolute", inset: s(14),
        border: `1px solid ${P.hairline}`, borderRadius: s(18)
      }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: s(10) }}>
          <div style={{ width: s(26), height: s(2), background: P.gold }} />
          <div style={{ fontSize: s(15), letterSpacing: s(6), fontWeight: 700, color: P.gold }}>
            L.O.O.M.
          </div>
        </div>
        <div style={{
          fontSize: s(14), color: P.muted, letterSpacing: s(2),
          border: `1px solid ${P.hairline}`, borderRadius: s(999),
          padding: `${s(7)} ${s(16)}`
        }}>
          @{String(username || "").toUpperCase()}
        </div>
      </div>

      {/* Identity */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: s(18) }}>
        <div style={{
          width: story ? s(170) : s(126),
          height: story ? s(170) : s(126),
          borderRadius: s(999),
          background: `linear-gradient(150deg, ${accent}44 0%, rgba(255,255,255,0.06) 100%)`,
          border: `2px solid ${accent}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: story ? s(58) : s(44),
          fontWeight: 800,
          color: P.cream,
          letterSpacing: s(1)
        }}>
          {initials(name)}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: s(10) }}>
          <div style={{
            fontSize: story ? s(72) : s(58),
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: s(-1),
            maxWidth: story ? s(880) : s(820)
          }}>
            {name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: s(12) }}>
            <div style={{
              fontSize: s(15), letterSpacing: s(3), fontWeight: 700,
              color: accent, textTransform: "uppercase"
            }}>
              {domainLabel(domain)}
            </div>
          </div>
          {bio && (
            <div style={{
              fontSize: s(20), color: P.muted, lineHeight: 1.45,
              maxWidth: story ? s(760) : s(720)
            }}>
              {String(bio).slice(0, story ? 180 : 150)}
            </div>
          )}
        </div>
      </div>

      {/* Proof — only real values */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: s(24) }}>
        <div style={{ display: "flex", gap: s(10), flexWrap: "wrap", maxWidth: s(760) }}>
          {stats.length === 0 ? (
            <div style={{ fontSize: s(16), color: P.faint, letterSpacing: s(2) }}>
              BUILDING IN PUBLIC
            </div>
          ) : stats.map((st) => (
            <div
              key={st.label}
              style={{
                display: "flex", flexDirection: "column", gap: s(4),
                padding: `${s(12)} ${s(18)}`,
                border: `1px solid ${P.hairline}`,
                borderRadius: s(12),
                background: "rgba(255,255,255,0.04)",
                minWidth: s(112)
              }}
            >
              <div style={{ fontSize: s(11), letterSpacing: s(2), color: P.faint }}>{st.label}</div>
              <div style={{ fontSize: s(30), fontWeight: 800, color: P.cream }}>{st.value}</div>
            </div>
          ))}
        </div>

        {siteUrl && !square ? (
          <div style={{
            display: "flex", alignItems: "center", gap: s(8),
            padding: `${s(12)} ${s(20)}`,
            background: P.gold, borderRadius: s(12),
            color: "#0a1628", fontSize: s(16), fontWeight: 800
          }}>
            {String(siteUrl).replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </div>
        ) : null}
      </div>
    </div>
  );
}
