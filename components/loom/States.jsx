"use client";

import Link from "next/link";
import { Display } from "./primitives";

/* Onboarding state — every empty state answers: why empty, what next,
   why care. Never a bare "No data" sentence. */

export function OnboardingState({ eyebrow = "Just starting", title, why, steps = [], action }) {
  return (
    <div className="mx-auto max-w-2xl py-10 text-center sm:py-14">
      <p className="meta" style={{ color: "var(--accent)" }}>{eyebrow}</p>
      <Display size="md" className="mt-3">{title}</Display>
      {why && <p className="narrative mx-auto mt-4 text-center">{why}</p>}
      {steps.length > 0 && (
        <ol className="mx-auto mt-8 max-w-md space-y-0 text-left">
          {steps.map((s, i) => (
            <li key={i} className="tl-item is-todo">
              <span className="tl-dot" aria-hidden="true" />
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{s.title}</p>
              <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>{s.body}</p>
            </li>
          ))}
        </ol>
      )}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

/* Content-aware skeleton — mirrors the shape of what's loading. */

export function Skeleton({ lines = 3, className = "" }) {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skel mb-2.5"
          style={{ height: 14, width: i === lines - 1 ? "55%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function SkeletonHero() {
  return (
    <div aria-hidden="true">
      <div className="skel" style={{ height: 18, width: "32%" }} />
      <div className="skel mt-4" style={{ height: 44, width: "78%" }} />
      <div className="skel mt-3" style={{ height: 44, width: "62%" }} />
      <div className="skel mt-5" style={{ height: 16, width: "48%" }} />
    </div>
  );
}

/* Actionable error — what happened, last good state, what to do. */

export function ErrorState({ title, body, lastGood, retryLabel = "Try again", onRetry, backHref, backLabel = "Go back" }) {
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <p className="meta" style={{ color: "var(--danger)" }}>Something interrupted</p>
      <h2 className="h-product mt-3">{title}</h2>
      {body && <p className="narrative mx-auto mt-3 text-center">{body}</p>}
      {lastGood && <p className="meta mt-4">Last good state · {lastGood}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {onRetry && <button type="button" onClick={onRetry} className="btn-ink">{retryLabel}</button>}
        {backHref && <Link href={backHref} className="btn-ghost">{backLabel}</Link>}
      </div>
    </div>
  );
}
