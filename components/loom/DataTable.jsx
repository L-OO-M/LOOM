"use client";

/* Dense table — repos, rosters, logs, sessions. Quiet chrome, readable rows.
   columns: [{ key, label, align?, mono?, render?(row) }]. */

export function DataTable({ columns, rows, empty = "Nothing here yet.", caption }) {
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
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
