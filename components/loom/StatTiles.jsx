/* Visual stat tiles: big serif numeral, hairline meter, one-line label.
   Same honesty contract as PlainStat — every number is a live prop, never
   a constant. pct (0-100) is optional and only passed when a real denominator
   exists (e.g. roadmap completion). */

export function StatTile({ value, unit, label, pct = null, tone = "var(--text)" }) {
  const bar = pct == null ? null : Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className="spot-card rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <p className="font-display text-4xl font-medium leading-none sm:text-5xl" style={{ color: tone }}>
        {value}
        {unit && <span className="ml-2 align-middle font-sans text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>{unit}</span>}
      </p>
      {bar != null && (
        <div className="mt-4 h-1 overflow-hidden rounded-full" role="img" aria-label={`${label}: ${bar} percent`} style={{ background: "var(--line)" }}>
          <div className="h-full rounded-full" style={{ width: `${bar}%`, background: "linear-gradient(to right, var(--thread-cyan), var(--thread-gold))" }} />
        </div>
      )}
      <p className="mt-3 max-w-52 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{label}</p>
    </div>
  );
}

export function TileGrid({ children, cols = 2 }) {
  return (
    <div className={`mt-4 grid gap-3 ${cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {children}
    </div>
  );
}
