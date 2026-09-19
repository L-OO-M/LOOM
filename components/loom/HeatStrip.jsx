"use client";

// 14-cell + 30-cell heat strip: sequential value (saturation) per day.
// Darker = more activity. Pairs value with numeric label for a11y.
export function HeatStrip({ days, max = null, emptyLabel = "No activity" }) {
  if (!Array.isArray(days) || days.length === 0) {
    return <p className="narrative text-sm">{emptyLabel}</p>;
  }
  const peak = max ?? Math.max(1, ...days.map((d) => Number(d.value) || 0));
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`Activity heat strip, ${days.length} days`}>
      {days.map((d) => {
        const v = Number(d.value) || 0;
        const lvl = peak === 0 ? 0 : v === 0 ? 0 : v <= peak * 0.33 ? 1 : v <= peak * 0.66 ? 2 : v <= peak * 0.9 ? 3 : 4;
        return (
          <div
            key={d.label}
            title={`${d.label}: ${v}`}
            data-l={String(lvl)}
            className="heat-cell flex-1"
            style={{ height: 18, minWidth: 6, flex: "1 1 0" }}
            aria-label={`${d.label} ${v}`}
          />
        );
      })}
    </div>
  );
}
