"use client";

import Link from "next/link";

/* Dense table — repos, rosters, logs, sessions. Quiet chrome, readable rows.
   Everything crossing the server boundary must be serializable, so cells
   render by `kind` (a plain string) instead of callback functions.
   columns: [{ key, label, align?, mono?, kind?, fallback? }]
   kinds: text (default) | strong | date | pulse | repo | stars | gfi |
          verify | student | studentOpen */

function fmtStars(n) {
  if (!n) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

function Cell({ col, row, pulse }) {
  const raw = row[col.key];
  const empty = raw === null || raw === undefined || raw === "";
  const fallback = col.fallback ?? "—";

  switch (col.kind) {
    case "strong":
      return <span className="font-medium" style={{ color: "var(--text)" }}>{empty ? fallback : String(raw)}</span>;
    case "date":
      return <span>{fmtDate(raw) ?? fallback}</span>;
    case "pulse": {
      const n = pulse?.[row.id] || 0;
      if (n === 0) return <span className="meta">quiet</span>;
      return (
        <span className="flex gap-1" aria-hidden="true">
          {Array.from({ length: Math.min(6, n) }).map((_, i) => (
            <span key={i} className="size-1.5 rounded-full" style={{ background: "var(--accent)" }} />
          ))}
        </span>
      );
    }
    case "repo":
      return (
        <span>
          <a href={row.github_repo_url} target="_blank" rel="noreferrer" className="font-mono font-semibold hover:underline" style={{ color: "var(--text)" }}>
            {row.owner}/{row.repo_name}
          </a>
          {row.description && (
            <span className="mt-0.5 block max-w-md truncate text-xs font-normal" style={{ color: "var(--text-muted)" }}>
              {row.description}
            </span>
          )}
        </span>
      );
    case "stars":
      return <span>{fmtStars(raw)}</span>;
    case "gfi":
      return <span>{raw > 0 ? `${raw}+` : "—"}</span>;
    case "verify":
      return (
        <Link href={`/verify/credential/${row.id}`} target="_blank" rel="noreferrer" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
          Open →
        </Link>
      );
    case "student":
      return (
        <Link href={`/admin/students/${row.user_id}`} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>
          {row.name}
        </Link>
      );
    case "studentOpen":
      return (
        <Link href={`/admin/students/${row.user_id}`} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
          Open →
        </Link>
      );
    default:
      return <span>{empty ? fallback : String(raw)}</span>;
  }
}

export function DataTable({ columns, rows, empty = "Nothing here yet.", caption, pulse }) {
  if (!rows || rows.length === 0) {
    return <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="dtable">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={c.align === "right" ? { textAlign: "right" } : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? row.key ?? i}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={c.mono ? "num" : ""}
                  style={c.align === "right" ? { textAlign: "right" } : undefined}
                >
                  <Cell col={c} row={row} pulse={pulse} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
