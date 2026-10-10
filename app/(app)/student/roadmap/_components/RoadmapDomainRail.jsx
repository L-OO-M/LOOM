"use client";

import Link from "next/link";
import { domainLabel } from "@/lib/domains";

/**
 * One rail of domain chips above the roadmap. Each chip carries its own honest
 * progress, so switching tracks is a decision the member can make with
 * information rather than guesswork. Uses ?domain= so the choice is linkable and
 * survives a refresh or a shared URL.
 */
export function RoadmapDomainRail({ domains, active }) {
  if (!domains || domains.length <= 1) return null;

  return (
    <nav aria-label="Choose a roadmap domain" className="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
        {domains.map(({ domain, total, done }) => {
          const isActive = domain === active;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <li key={domain}>
              <Link
                href={`/student/roadmap?domain=${domain}`}
                prefetch={false}
                aria-current={isActive ? "page" : undefined}
                className="group flex min-w-[9.5rem] flex-col gap-1.5 rounded-xl border px-3.5 py-2.5 transition"
                style={{
                  borderColor: isActive ? "var(--accent)" : "var(--line)",
                  background: isActive ? "var(--bg-elevated)" : "transparent",
                }}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span
                    className="text-sm font-semibold leading-none"
                    style={{ color: isActive ? "var(--accent)" : "var(--text)" }}
                  >
                    {domainLabel(domain)}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {done}/{total}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="block h-1 overflow-hidden rounded-full"
                  style={{ background: "var(--bg-muted)" }}
                >
                  <span
                    className="block h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${pct}%`, background: "var(--accent)" }}
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}