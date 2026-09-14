"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";

/* Evidence block — proof of building, with its verification trail.
   checks: [string]. Never rendered without real backing data. */

export function Evidence({ kicker, title, body, href, hrefLabel = "Open evidence", checks = [], meta }) {
  return (
    <article className="evidence">
      {kicker && <p className="meta" style={{ color: "var(--accent)" }}>{kicker}</p>}
      <h3 className="mt-1.5 text-[0.95rem] font-semibold leading-6" style={{ color: "var(--text)" }}>{title}</h3>
      {body && <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{body}</p>}
      {checks.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {checks.map((c) => (
            <li key={c} className="flex items-start gap-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
              <BadgeCheck size={14} strokeWidth={2} className="evidence-check mt-0.5 shrink-0" />
              {c}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            {hrefLabel} →
          </a>
        ) : <span />}
        {meta && <span className="meta">{meta}</span>}
      </div>
    </article>
  );
}

/* Activity stream — lightweight rows for people, proof, and momentum. */

export function ActivityStream({ items }) {
  return (
    <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3 py-3">
          <span
            className="mt-1.5 size-1.5 shrink-0 rounded-full"
            style={{ background: it.hot ? "var(--accent)" : "var(--line)" }}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-6" style={{ color: "var(--text)" }}>
              {it.actor && <strong className="font-semibold">{it.actor} </strong>}
              {it.text}
            </p>
            {it.meta && <p className="meta mt-0.5">{it.meta}</p>}
          </div>
          {it.href && (
            <Link href={it.href} className="shrink-0 text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
              Open →
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
