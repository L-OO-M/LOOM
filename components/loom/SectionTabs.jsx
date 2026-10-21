import Link from "next/link";

/**
 * A server-rendered tab rail for sibling views that share one subject.
 *
 * Plain links, no client state: each tab is a real URL, so refresh, back, and
 * deep links keep working and nothing needs hydration. `active` is the href the
 * caller knows it is rendering (pass the canonical path, not the request URL).
 */
export function SectionTabs({ tabs = [], active = null, label = "Sections", className = "" }) {
  if (tabs.length === 0) return null;
  return (
    <nav aria-label={label} className={`flex flex-wrap gap-x-5 gap-y-2 border-b ${className}`.trim()} style={{ borderColor: "var(--line)" }}>
      {tabs.map((t) => {
        const isActive = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch={false}
            aria-current={isActive ? "page" : undefined}
            className="flex items-center gap-1.5 pb-2.5 text-sm transition-colors"
            style={{
              color: isActive ? "var(--text)" : "var(--text-muted)",
              fontWeight: isActive ? 600 : 400,
              boxShadow: isActive ? "inset 0 -2px 0 var(--accent)" : "none"
            }}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                style={{ background: "var(--bg-muted)", color: "var(--text-muted)" }}>
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
