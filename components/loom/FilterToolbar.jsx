"use client";

import Link from "next/link";

export function FilterToolbar({ children, className = "" }) {
  return (
    <div className={`mt-6 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border p-1.5 sm:p-2 ${className}`} style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      {children}
    </div>
  );
}

export function SearchField({ name = "q", defaultValue, placeholder = "Search…", hidden = {} }) {
  return (
    <div className="flex min-w-[220px] flex-1 items-center gap-2">
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-[var(--radius-md)] border px-3 text-sm outline-none transition focus:border-[var(--accent)]"
        style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
      />
      {Object.entries(hidden).map(([k, v]) => v ? <input key={k} type="hidden" name={k} value={v} /> : null)}
    </div>
  );
}

export function ToolbarPill({ href, active, children }) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-pressed={active}
      className="rounded-full px-3.5 py-1.5 text-sm font-medium transition active:scale-[0.98]"
      style={active ? { background: "var(--text)", color: "var(--bg)" } : { background: "transparent", color: "var(--text-muted)", border: "1px solid var(--line)" }}
    >
      {children}
    </Link>
  );
}
