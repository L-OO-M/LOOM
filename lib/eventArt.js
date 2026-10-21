/**
 * Deterministic event artwork.
 *
 * Shared by the public banner (app/events/_components/EventBanner.jsx) and the
 * unfurl card (lib/eventCard.jsx) so the social preview and the page show the
 * same art for the same event. Pure: no DB, no React, no randomness.
 */

export const EVENT_PALETTES = [
  { a: "#3fd2e0", b: "#1d4ed8", wash: "rgba(63,210,224,0.20)" },
  { a: "#e8c26a", b: "#b45309", wash: "rgba(232,194,106,0.20)" },
  { a: "#a78bfa", b: "#4c1d95", wash: "rgba(167,139,250,0.20)" },
  { a: "#34d399", b: "#065f46", wash: "rgba(52,211,153,0.20)" },
  { a: "#fb7185", b: "#9f1239", wash: "rgba(251,113,133,0.20)" },
  { a: "#60a5fa", b: "#1e3a8a", wash: "rgba(96,165,250,0.20)" }
];

export function eventHash(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic palette + geometry for one event. Same input, same art. */
export function bannerFor(event) {
  const seed = eventHash(`${event?.id ?? ""}:${event?.domain ?? ""}:${event?.event_type ?? ""}`);
  const pal = EVENT_PALETTES[seed % EVENT_PALETTES.length];
  const nodes = Array.from({ length: 7 }, (_, i) => {
    const a = eventHash(`${seed}:node:${i}`);
    return {
      x: 6 + (a % 88),
      y: 10 + ((a >> 3) % 80),
      r: 10 + ((a >> 7) % 34),
      o: 0.16 + ((a >> 11) % 26) / 100
    };
  });
  const lines = Array.from({ length: 5 }, (_, i) => {
    const a = eventHash(`${seed}:line:${i}`);
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
