"use client";

import { compact, sourceFor } from "@/lib/analytics";

function ListCard({ title, hint, items, empty, selectedKey }) {
  return (
    <article className="flex min-w-0 flex-col rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <h3 className="text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>{title}</h3>
      {hint && <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</p>}
      {items.length === 0 ? (
        <p className="mt-3 text-[12.5px] leading-5" style={{ color: "var(--text-muted)" }}>{empty}</p>
      ) : (
        <ul className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
          {items.map((it) => {
            const key = `${it.kind}:${it.id}`;
            const sel = selectedKey === key;
            const max = Math.max(1, ...items.map((x) => x.bar ?? 0));
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => it.onPick()}
                  aria-pressed={sel}
                  title={`${it.label} — show details`}
                  className="block w-full rounded-lg px-2 py-2 text-left transition hover:bg-[var(--bg-muted)]"
                  style={sel ? { background: "var(--dash-accent-soft)" } : undefined}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" style={{ color: sel ? "var(--dash-accent-strong)" : "var(--text)" }}>
                      {it.label}
                    </span>
                    <span className="shrink-0 text-[11.5px] tabular-nums" style={{ color: "var(--text-muted)" }}>{it.metric}</span>
                  </span>
                  {it.bar != null && (
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg-muted)" }} aria-hidden="true">
                      <span className="block h-full rounded-full" style={{ width: `${(it.bar / max) * 100}%`, background: "var(--dash-accent)" }} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

export function TopLists({ tops, selected, onSelect }) {
  const selKey = selected ? `${selected.kind}:${selected.id}` : null;
  const t = tops || { referrers: [], pages: [], sources: [] };
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <ListCard
        title="Top HTTP Referrers"
        hint="Where visitors arrive from — click for detail"
        empty="No referrer data yet. Visit from an external link and it appears here."
        selectedKey={selKey}
        items={(t.referrers || []).map((r) => ({
          kind: "referrer", id: r.id, label: r.label, metric: `${compact(r.count)} visits`, bar: r.count,
          onPick: () => onSelect({ kind: "referrer", id: r.id, label: r.label, ...r }),
        }))}
      />
      <ListCard
        title="Top Pages"
        hint="Most viewed paths — click for detail"
        empty="No page data yet. Browse the site and the counts land here."
        selectedKey={selKey}
        items={(t.pages || []).map((p) => ({
          kind: "page", id: p.id, label: p.label, metric: `${compact(p.count)} views`, bar: p.count,
          onPick: () => onSelect({ kind: "page", id: p.id, label: p.label, ...p }),
        }))}
      />
      <ListCard
        title="Top Sources"
        hint="Traffic channels — click to inspect"
        empty="No source data yet."
        selectedKey={selKey}
        items={(t.sources || []).map((s) => ({
          kind: "source", id: s.id, label: s.label, metric: `${compact(s.count)} · ${s.pct}%`, bar: s.count,
          onPick: () => onSelect({ kind: "source", id: s.id, label: s.label, ...s }),
        }))}
      />
    </div>
  );
}

export function SelectionDetail({ selected, onClear }) {
  if (!selected) return null;
  let lines = [];
  if (selected.kind === "referrer") {
    lines = [
      ["Visits", compact(selected.count ?? 0)],
      ["Channel", sourceFor(selected.id === "Direct" ? null : selected.id)],
    ];
  } else if (selected.kind === "page") {
    lines = [["Views", compact(selected.count ?? 0)]];
  } else if (selected.kind === "source") {
    lines = [
      ["Visits", compact(selected.count ?? 0)],
      ["Share", `${selected.pct ?? 0}% of tracked visits`],
    ];
  } else if (selected.kind === "node") {
    lines = [
      ["Started", compact(selected.started ?? 0)],
      ["Completed", compact(selected.completed ?? 0)],
      ["Drop-off", `${Number(selected.dropOff ?? 0)}%`],
      ["Domain", selected.domain || "general"],
    ];
  } else if (selected.kind === "domain") {
    lines = [["Members", compact(selected.count ?? 0)]];
  } else if (selected.kind === "event") {
    lines = [
      ["Registrations", compact(selected.regs ?? 0)],
      ["Starts", selected.when ? new Date(selected.when).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "—"],
    ];
  } else if (selected.kind === "resource") {
    lines = [
      ["Completions", compact(selected.done ?? 0)],
      ["Domain", selected.domain || "general"],
    ];
  }
  return (
    <section aria-live="polite" className="flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-xl border px-4 py-3" style={{ borderColor: "var(--dash-accent)", background: "var(--dash-accent-soft)" }}>
      <p className="text-[13px] font-semibold" style={{ color: "var(--dash-accent-strong)" }}>{selected.label}</p>
      {lines.map(([k, v]) => (
        <p key={k} className="text-[12px]" style={{ color: "var(--text)" }}>
          <span style={{ color: "var(--text-muted)" }}>{k}: </span><strong className="tabular-nums">{v}</strong>
        </p>
      ))}
      <button type="button" onClick={onClear} className="ml-auto text-[12px] font-semibold hover:underline" style={{ color: "var(--dash-accent-strong)" }}>
        Clear filter
      </button>
    </section>
  );
}
