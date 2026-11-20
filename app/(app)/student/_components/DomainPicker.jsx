"use client";

import { Check } from "lucide-react";

// The one track picker used by onboarding and settings.
//
// It replaces a free-text input that expected a raw key like "web". Typing the
// display label ("Web Development") or a stale value failed server validation
// with an opaque 400, and members had no way to see which tracks actually have
// content. Here every option is a real radio, so keyboard and screen-reader
// behaviour comes from the platform, and the node count is shown before the
// choice is made.
export default function DomainPicker({ domains, value, onChange, name = "primaryDomain", disabled = false }) {
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">Your primary track</legend>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {domains.map((domain) => {
          const selected = domain.key === value;
          return (
            <label
              key={domain.key}
              className="group relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3.5 transition-colors focus-within:ring-2 focus-within:ring-[var(--accent)]"
              style={{
                borderColor: selected ? "var(--accent)" : "var(--line)",
                background: selected ? "var(--wash)" : "var(--bg-elevated)"
              }}
            >
              <input
                type="radio"
                name={name}
                value={domain.key}
                checked={selected}
                onChange={() => onChange(domain.key)}
                className="sr-only"
              />
              <span className="flex items-start justify-between gap-2">
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 place-items-center rounded-lg font-mono text-[11px] font-semibold tracking-wide"
                  style={{
                    background: selected ? "var(--accent)" : "var(--bg-muted)",
                    color: selected ? "var(--on-accent)" : "var(--text-muted)"
                  }}
                >
                  {domain.glyph}
                </span>
                {selected && <Check size={15} aria-hidden="true" style={{ color: "var(--accent)" }} />}
              </span>
              <span className="text-sm font-semibold leading-5" style={{ color: "var(--text)" }}>{domain.label}</span>
              <span className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>{domain.blurb}</span>
              <span className="meta mt-auto pt-1">{domain.nodes} nodes</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
