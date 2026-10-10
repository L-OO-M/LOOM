"use client";

import { PALETTES, useTheme } from "@/lib/theme";

/* Appearance controls live inside the existing Settings page rather than on a
   page of their own: light/dark plus the colour palettes. Everything is stored
   in localStorage and applied as a data attribute, so there is no layout shift
   and no extra route to maintain. */
export function AppearancePanel() {
  const { theme, palette, toggle, setPalette, mounted } = useTheme();
  if (!mounted) return null;

  return (
    <section className="mt-10" aria-label="Appearance">
      <h2 className="font-display text-lg font-medium" style={{ color: "var(--text)" }}>
        Appearance
      </h2>
      <p className="meta mt-1">Try a palette. It applies instantly and stays on this device.</p>

      <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="meta">Light / dark</span>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={theme === "dark"}
            className="rounded-full border px-3.5 py-1.5 text-xs font-semibold transition"
            style={{
              borderColor: theme === "dark" ? "var(--accent)" : "var(--line)",
              background: theme === "dark" ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
              color: "var(--text)",
            }}
          >
            {theme === "dark" ? "Dark" : "Light"}
          </button>
        </div>

        <div className="mt-5">
          <span className="meta">Palette</span>
          <ul className="mt-2 flex flex-wrap gap-2">
            {PALETTES.map((p) => {
              const active = palette === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setPalette(p.id)}
                    aria-pressed={active}
                    className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--line)",
                      background: active ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
                      color: "var(--text)",
                    }}
                  >
                    <span className="flex overflow-hidden rounded" aria-hidden="true">
                      <span className="block size-4" style={{ background: p.swatch[0] }} />
                      <span className="block size-4" style={{ background: p.swatch[1] }} />
                    </span>
                    {p.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}