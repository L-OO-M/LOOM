import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// WCAG 2.1 AA contrast guards for the theme tokens in app/globals.css.
// Ratios are computed from the values actually shipped, so a future token edit
// that drops body, meta, accent, or tier-pill text below 4.5:1 fails here
// instead of being discovered in an audit months later. Assertions are ratios,
// never exact hex values, so the palette can be retuned without rewriting tests.

const CSS_PATH = path.resolve("app/globals.css");
const CSS = fs.readFileSync(CSS_PATH, "utf8");
const MIN_TEXT = 4.5;

function themeBlock(theme) {
  // Anchored at line start so `[data-theme="dark"] .floatbar { … }` can't match.
  const re = new RegExp(`^\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`, "m");
  const match = CSS.match(re);
  if (!match) throw new Error(`app/globals.css has no [data-theme="${theme}"] token block`);
  return match[1];
}

function tokens(theme) {
  const map = {};
  for (const [, name, value] of themeBlock(theme).matchAll(/--([a-z-]+)\s*:\s*([^;]+);/g)) {
    map[name] = value.trim();
  }
  return map;
}

const THEMES = { dark: tokens("dark"), light: tokens("light") };

function hex(theme, name, seen = new Set()) {
  const map = THEMES[theme];
  const raw = map[name];
  if (!raw) throw new Error(`--${name} is not defined in the ${theme} theme`);
  const ref = raw.match(/^var\(--([a-z-]+)\)$/);
  if (ref) {
    if (seen.has(name)) throw new Error(`--${name} resolves circularly in the ${theme} theme`);
    return hex(theme, ref[1], seen.add(name));
  }
  const short = raw.match(/^#([0-9a-f]{3})$/i);
  const long = raw.match(/^#([0-9a-f]{6})$/i);
  if (short) return `#${[...short[1]].map((c) => c + c).join("")}`;
  if (long) return `#${long[1]}`;
  throw new Error(`--${name} in the ${theme} theme is not a hex colour: ${raw}`);
}

function channel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(color) {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(color.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(theme, foreground, background) {
  const a = luminance(hex(theme, foreground));
  const b = luminance(hex(theme, background));
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

// Foreground / background pairs that carry real text in the dark theme.
// Tier pills (`.adst-tier-pill[data-tier]`) paint --success / --warn directly as
// their small uppercase text, on the page, on elevated panels, and on the
// inset surfaces they are usually nested in.
const DARK_PAIRS = [
  ["text", "bg", "body copy"],
  ["text-muted", "bg", "meta text"],
  ["text", "bg-elevated", "body copy on panels"],
  ["text", "bg-muted", "body copy on inset surfaces"],
  ["text-muted", "bg-elevated", "meta text on panels"],
  ["text-muted", "bg-muted", "meta text on inset surfaces"],
  ["accent", "bg", "accent as text"],
  ["accent", "bg-elevated", "accent as text on panels"],
  ["accent", "bg-muted", "accent as text on inset surfaces"],
  ["on-accent", "accent", "ink on accent surfaces"],
  ["success", "bg", "green tier pill"],
  ["success", "bg-elevated", "green tier pill on panels"],
  ["success", "bg-muted", "green tier pill on inset surfaces"],
  ["warn", "bg", "orange tier pill"],
  ["warn", "bg-elevated", "orange tier pill on panels"],
  ["warn", "bg-muted", "orange tier pill on inset surfaces"]
];

// The light theme's body/meta text was already compliant, but its tier pills
// were not (green 3.57:1 and orange 3.16:1 on the inset surface), so the tokens
// were darkened rather than left to fail on the surfaces they actually sit on.
const LIGHT_PAIRS = [
  ["text", "bg", "body copy"],
  ["text-muted", "bg", "meta text"],
  ["text", "bg-elevated", "body copy on panels"],
  ["text-muted", "bg-muted", "meta text on inset surfaces"],
  ["on-accent", "accent", "ink on accent surfaces"],
  ["success", "bg", "green tier pill"],
  ["success", "bg-elevated", "green tier pill on panels"],
  ["success", "bg-muted", "green tier pill on inset surfaces"],
  ["warn", "bg", "orange tier pill"],
  ["warn", "bg-elevated", "orange tier pill on panels"],
  ["warn", "bg-muted", "orange tier pill on inset surfaces"]
];

describe.each([
  ["dark", DARK_PAIRS],
  ["light", LIGHT_PAIRS]
])("%s theme contrast", (theme, pairs) => {
  it.each(pairs)("%s on %s (%s) meets AA at 4.5:1", (foreground, background, use) => {
    const value = ratio(theme, foreground, background);
    expect(
      value,
      `--${foreground} on --${background} (${use}) is ${value.toFixed(2)}:1 in the ${theme} theme`
    ).toBeGreaterThanOrEqual(MIN_TEXT);
  });
});

describe("accent pill foreground", () => {
  it("resolves .pill.is-gold to the theme accent-ink token", () => {
    const rule = CSS.match(/\.pill\.is-gold\s*\{[^}]*\}/);
    expect(rule, ".pill.is-gold rule missing from app/globals.css").toBeTruthy();
    expect(
      rule[0],
      ".pill.is-gold must take its foreground from --on-accent so each theme sets its own ink"
    ).toMatch(/color:\s*var\(--on-accent\)/);
  });

  it("keeps accent ink above 4.5:1 in both themes", () => {
    for (const theme of ["dark", "light"]) {
      const value = ratio(theme, "on-accent", "accent");
      expect(value, `--on-accent on --accent is ${value.toFixed(2)}:1 in the ${theme} theme`).toBeGreaterThanOrEqual(MIN_TEXT);
    }
  });
});
