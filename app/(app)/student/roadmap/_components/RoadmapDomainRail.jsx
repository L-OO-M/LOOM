"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { domainLabel } from "@/lib/domains";

/**
 * One rail of domain chips above the roadmap. Each chip carries its own honest
 * progress, so switching tracks is a decision the member can make with
 * information rather than guesswork. Uses ?domain= so the choice is linkable and
 * survives a refresh or a shared URL.
 *
 * The follow control below each chip is what makes several roadmaps first-class:
 * the primary track is always tracked, and any other chip can be added to the
 * dashboard's track list without changing the onboarding answer.
 */
export function RoadmapDomainRail({ domains, active, primary = null, followed = [] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [saved, setSaved] = useState(followed);
  const [error, setError] = useState("");

  if (!domains || domains.length <= 1) return null;

  const isFollowing = (domain) => domain === primary || saved.includes(domain);

  async function toggle(domain, follow) {
    setBusy(domain);
    setError("");
    try {
      const res = follow
        ? await fetch("/api/tracks", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ domain })
          })
        : await fetch(`/api/tracks?domain=${encodeURIComponent(domain)}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error?.message || "Could not update your tracks.");
        return;
      }
      setSaved(data.data.tracks || []);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy("");
    }
  }

  return (
    <nav aria-label="Choose a roadmap domain" className="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max items-stretch gap-2 sm:w-auto sm:flex-wrap">
        {domains.map(({ domain, total, done }) => {
          const isActive = domain === active;
          const isPrimary = domain === primary;
          const following = isFollowing(domain);
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <li
              key={domain}
              className="flex min-w-[10rem] flex-col overflow-hidden rounded-xl border transition"
              style={{
                borderColor: isActive ? "var(--accent)" : "var(--line)",
                background: isActive ? "var(--bg-elevated)" : "transparent"
              }}
            >
              <Link
                href={`/student/roadmap?domain=${encodeURIComponent(domain)}`}
                prefetch={false}
                aria-current={isActive ? "page" : undefined}
                className="group flex flex-col gap-1.5 px-3.5 pb-2 pt-2.5"
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
              <button
                type="button"
                onClick={() => toggle(domain, !following)}
                disabled={isPrimary || busy === domain}
                aria-pressed={following}
                aria-label={isPrimary
                  ? `${domainLabel(domain)} is your primary track`
                  : following
                    ? `Stop following the ${domainLabel(domain)} roadmap`
                    : `Follow the ${domainLabel(domain)} roadmap`}
                className="border-t px-3.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] disabled:cursor-default"
                style={{
                  borderColor: "var(--line)",
                  color: following ? "var(--accent)" : "var(--text-muted)"
                }}
              >
                {isPrimary ? "Primary" : busy === domain ? "Saving…" : following ? "✓ Following" : "Follow"}
              </button>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="status" className="mt-2 text-xs font-semibold" style={{ color: "var(--danger, #b42318)" }}>{error}</p>
      ) : null}
    </nav>
  );
}
