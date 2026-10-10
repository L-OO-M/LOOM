/* Generated event banners.
 *
 * No object storage is wired (R2 creds are empty), so we do not fake photos or
 * ship stock imagery that has nothing to do with the event. Instead every event
 * gets a deterministic banner derived from its own id + domain: the same event
 * always renders the same artwork, different events never collide, and it costs
 * zero bytes of upload.
 *
 * Colours come from the landing palette (#0a1628 navy, #e8c26a gold,
 * #3fd2e0 cyan) so it sits correctly next to PageHero on both themes.
 */

const PALETTES = [
  { a: "#3fd2e0", b: "#1d4ed8", wash: "rgba(63,210,224,0.20)" },
  { a: "#e8c26a", b: "#b45309", wash: "rgba(232,194,106,0.20)" },
  { a: "#a78bfa", b: "#4c1d95", wash: "rgba(167,139,250,0.20)" },
  { a: "#34d399", b: "#065f46", wash: "rgba(52,211,153,0.20)" },
  { a: "#fb7185", b: "#9f1239", wash: "rgba(251,113,133,0.20)" },
  { a: "#60a5fa", b: "#1e3a8a", wash: "rgba(96,165,250,0.20)" }
];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic palette + geometry for one event. Pure — same input, same art. */
export function bannerFor(event) {
  const seed = hash(`${event?.id ?? ""}:${event?.domain ?? ""}:${event?.event_type ?? ""}`);
  const pal = PALETTES[seed % PALETTES.length];
  const nodes = Array.from({ length: 7 }, (_, i) => {
    const a = hash(`${seed}:node:${i}`);
    return {
      x: 6 + (a % 88),
      y: 10 + ((a >> 3) % 80),
      r: 10 + ((a >> 7) % 34),
      o: 0.16 + ((a >> 11) % 26) / 100
    };
  });
  const lines = Array.from({ length: 5 }, (_, i) => {
    const a = hash(`${seed}:line:${i}`);
    return {
      x1: a % 100,
      y1: (a >> 5) % 100,
      x2: (a >> 9) % 100,
      y2: (a >> 13) % 100,
      o: 0.10 + ((a >> 17) % 18) / 100
    };
  });
  return { pal, nodes, lines, seed };
}

export function EventBanner({ event, className = "", ratio = "16 / 9" }) {
  const { pal, nodes, lines } = bannerFor(event);
  const title = event?.title || "Event";
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio: ratio, background: "#0a1628" }}
      role="img"
      aria-label={`Banner artwork for ${title}`}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`bg-${event?.id ?? "x"}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={pal.b} />
            <stop offset="100%" stopColor="#0a1628" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#bg-${event?.id ?? "x"})`} />
        {nodes.map((n, i) => (
          <circle key={`n${i}`} cx={n.x} cy={n.y} r={n.r} fill={pal.a} opacity={n.o} />
        ))}
        {lines.map((l, i) => (
          <line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#f4f1e8" strokeOpacity={l.o} strokeWidth="0.3" />
        ))}
      </svg>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        aria-hidden="true"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")"
        }}
      />
    </div>
  );
}