"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusPill } from "@/components/loom/primitives";

const PAGE_STEP = 10;
const INITIAL_ROWS = 20;

function progressLine(r) {
  return `${r.nodes_done} node${r.nodes_done === 1 ? "" : "s"} · ${r.commits} commit${r.commits === 1 ? "" : "s"} · ${r.prs} PR${r.prs === 1 ? "" : "s"} · ${r.projects} project${r.projects === 1 ? "" : "s"}`;
}

// Client island for the Standings board: lightweight search over the fetched
// slice plus incremental reveal. Scope/period stay server-side (URL params)
// so the board is shareable and pooler-cheap; this component never fetches.
export default function StandingsBoard({ rows, scopeLabel }) {
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(INITIAL_ROWS);
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.name || ""} ${r.primary_domain || ""}`.toLowerCase().includes(q)
    );
  }, [rows, q]);

  const shown = filtered.slice(0, visible);

  return (
    <div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label htmlFor="standings-search" className="sr-only">Find a builder by name or track</label>
        <input
          id="standings-search"
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setVisible(INITIAL_ROWS); }}
          placeholder="Find a builder…"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-xl border px-3.5 py-2 text-sm sm:max-w-xs"
          style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
        />
        <span className="meta" role="status">
          {q
            ? `${filtered.length} match${filtered.length === 1 ? "" : "es"}`
            : `Showing ${shown.length} of ${rows.length} builders`}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>No builders match your search.</p>
          <p className="meta mt-2">Try a name or a track like “web”.</p>
          <button
            type="button"
            onClick={() => { setQuery(""); setVisible(INITIAL_ROWS); }}
            className="btn-ghost mt-5 !py-2 text-sm"
          >
            Clear search
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto border-y" style={{ borderColor: "var(--line)" }}>
            <table className="dtable" aria-label={`Standings board, ${scopeLabel}`}>
              <caption className="sr-only">
                Ranked builders by visible contribution score. Equal scores share a rank.
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: "3.5rem" }}>Rank</th>
                  <th scope="col">Builder</th>
                  <th scope="col">Progress</th>
                  <th scope="col" style={{ textAlign: "right" }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const self = !!r.is_self;
                  const top = r.rank <= 3;
                  return (
                    <tr
                      key={r.user_id}
                      aria-current={self ? "true" : undefined}
                      style={self
                        ? { background: "color-mix(in srgb, var(--accent) 7%, transparent)" }
                        : undefined}
                    >
                      <td>
                        <span
                          className="index-num"
                          style={r.rank === 1
                            ? { color: "var(--accent)", fontWeight: 700 }
                            : top ? { color: "var(--text)", fontWeight: 600 } : undefined}
                        >
                          {String(r.rank).padStart(2, "0")}
                        </span>
                      </td>
                      <td>
                        <span className="flex items-center gap-2.5">
                          <span className="grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold" style={{ background: "var(--bg-muted)", color: "var(--text)" }}>{String(r.name || "?").trim().split(/\s+/).map((w)=>w[0]).join("").slice(0,2).toUpperCase() || "?"}</span>
                          <span className="block min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              {r.rank === 1 && (
                                <span
                                  aria-hidden="true"
                                  className="inline-block h-4 w-0.5 shrink-0 rounded-full"
                                  style={{ background: "var(--accent)" }}
                                />
                              )}
                              {r.profile_href ? (
                                <Link
                                  href={r.profile_href}
                                  prefetch={false}
                                  className="truncate text-[0.95rem] font-semibold hover:underline"
                                  style={{ color: "var(--text)" }}
                                >
                                  {r.name}
                                </Link>
                              ) : (
                                <span className="truncate text-[0.95rem] font-semibold" style={{ color: "var(--text)" }}>
                                  {r.name}
                                </span>
                              )}
                              {self && <StatusPill tone="live">You</StatusPill>}
                            </span>
                            <span className="mono-tag mt-0.5 block">{r.primary_domain || "exploring"}</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="meta block whitespace-nowrap">{progressLine(r)}</span>
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        <span
                          className="font-semibold"
                          style={{ color: top ? "var(--accent)" : "var(--text)" }}
                        >
                          {Number(r.score).toLocaleString("en-IN")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="meta" role="status">
              Showing {shown.length} of {filtered.length} builders{q ? " matching" : " on this board"}
            </p>
            {filtered.length > shown.length && (
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE_STEP)}
                className="btn-ghost !py-2 text-sm"
              >
                Show more
              </button>
            )}
          </div>
          <p className="meta mt-3">
            The board ranks the top {rows.length} in {scopeLabel}. Equal scores share a rank.
          </p>
        </>
      )}
    </div>
  );
}
