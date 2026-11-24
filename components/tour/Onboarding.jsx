"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ProductTour } from "@/components/tour/ProductTour";
import { guideForPath, guideStorageKey } from "@/lib/page-guides";
import { TOUR_START_DELAY_MS, tourForArea, tourSeen, tourStorageKey } from "@/lib/tour";
import { track } from "@/lib/track-client";

/**
 * Onboarding layer for the three private workspaces.
 *
 * Two things, one state machine:
 *  1. A "how this page works" panel for the current screen: what it is for, the
 *     order work moves through it, and what each real control does. It renders
 *     in flow above the page content - never floating - so it cannot swallow a
 *     click or cover the control someone is trying to use. It opens itself on a
 *     first visit and then collapses to one summary line that is always there.
 *  2. The spotlight walkthrough for the workspace. The student tour still
 *     auto-starts on Home (where a walkthrough is welcome); lead and admin
 *     tours are started from the panel or Settings, so a console user is never
 *     interrupted mid-task.
 *
 * Seen-state is the profile's `tour_state` (written by /api/telemetry, read
 * once per tab here) with a localStorage mirror for the first paint. Dismissing
 * the panel records a `tour_complete` event for the guide id, which is why a
 * guide is just another id in that json.
 */

const STATE_CACHE = "loom-tour-state";
const START_EVENT = "loom:start-tour";

function readLocal(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage disabled: the profile write is the durable copy.
  }
}

export function Onboarding({ area, user }) {
  const pathname = usePathname();
  const userId = user?.id ?? null;
  const [tourState, setTourState] = useState(null);
  const [ready, setReady] = useState(false);
  const [guide, setGuide] = useState(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);
  const activeRef = useRef(null);
  activeRef.current = active;

  // One read per tab. The cached copy is only a session hint; the profile is
  // still authoritative on a fresh tab.
  useEffect(() => {
    let cancelled = false;
    try {
      const cached = window.sessionStorage.getItem(STATE_CACHE);
      if (cached) {
        setTourState(JSON.parse(cached));
        setReady(true);
        return () => {
          cancelled = true;
        };
      }
    } catch {
      // Fall through to the fetch.
    }
    fetch("/api/telemetry", { credentials: "same-origin" })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        const state = data?.ok ? data.data?.tourState || {} : {};
        setTourState(state);
        try {
          window.sessionStorage.setItem(STATE_CACHE, JSON.stringify(state));
        } catch {
          // Ignore: the in-memory copy still drives this tab.
        }
      })
      .catch(() => {
        if (!cancelled) setTourState({});
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const remember = useCallback(
    (entry) => {
      writeLocal(guideStorageKey(userId, entry), "done");
      setTourState((previous) => ({ ...(previous || {}), [entry.id]: entry.version }));
      track("tour_complete", {
        path: pathname,
        target: entry.id,
        metadata: { tour: entry.id, version: entry.version }
      });
    },
    [pathname, userId]
  );

  const startTour = useCallback(
    (forcedArea = area) => {
      const shell = tourForArea(forcedArea);
      if (!shell) return;
      setActive(shell);
    },
    [area]
  );

  // Resolve the current page's guide. Student Home is skipped on purpose: the
  // spotlight tour is the welcome there and two explanations would compete.
  useEffect(() => {
    if (!ready) return;
    const entry = guideForPath(pathname, tourState);
    setGuide(entry);
    const dismissed = readLocal(guideStorageKey(userId, entry || { id: "none", version: 0 })) === "done";
    const already = !!entry && (entry.seen || dismissed);
    setOpen(!!entry && !already && pathname !== "/student");
  }, [pathname, ready, tourState, userId]);

  // Student Home auto-starts once; every other workspace opts in.
  useEffect(() => {
    if (!ready || activeRef.current) return;
    const shell = tourForArea(area);
    if (!shell) return;
    const forced = new URLSearchParams(window.location.search).get("tour") === "1";
    if (forced) {
      setActive(shell);
      return;
    }
    if (readLocal(tourStorageKey(userId, shell.id, shell.version)) === "done") return;
    if (tourSeen(tourState, shell.id, shell.version)) return;
    if (area !== "student" || pathname !== "/student") return;
    const timer = setTimeout(() => setActive(shell), TOUR_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [area, pathname, ready, tourState, userId]);

  // Settings and the panel ask for a tour through this event, so they do not
  // need to know which component owns the overlay.
  useEffect(() => {
    function onStart(event) {
      startTour(event?.detail?.area || area);
    }
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, [area, startTour]);

  function finish(reason) {
    const shell = activeRef.current;
    setActive(null);
    if (!shell) return;
    if (reason === "complete" || reason === "skip") {
      writeLocal(tourStorageKey(userId, shell.id, shell.version), "done");
      setTourState((previous) => ({ ...(previous || {}), [shell.id]: shell.version }));
    }
    track(reason === "complete" ? "tour_complete" : "tour_skip", {
      path: pathname,
      target: shell.id,
      metadata: { tour: shell.id, version: shell.version, reason }
    });
  }

  function step(index, current) {
    const shell = activeRef.current;
    if (!shell) return;
    track("tour_step", {
      path: pathname,
      target: current.id,
      metadata: { tour: shell.id, version: shell.version, step: index + 1, step_id: current.id }
    });
  }

  function acknowledge() {
    if (guide) remember(guide);
    setOpen(false);
  }

  function showAround() {
    if (guide) remember(guide);
    setOpen(false);
    startTour();
  }

  const shellTour = tourForArea(area);

  return (
    <>
      {guide ? (
        <details
          className="mb-6 overflow-hidden rounded-2xl border"
          style={{
            borderColor: open ? "color-mix(in srgb, var(--accent) 45%, var(--line))" : "var(--line)",
            background: open ? "color-mix(in srgb, var(--accent) 4%, var(--bg-elevated))" : "transparent"
          }}
          open={open}
          onToggle={(event) => setOpen(event.currentTarget.open)}
        >
          <summary
            className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm font-semibold"
            style={{ color: open ? "var(--text)" : "var(--text-muted)", listStyle: "none" }}
          >
            <span aria-hidden="true" style={{ color: "var(--accent)" }}>{open ? "v" : ">"}</span>
            <span>How this page works</span>
            <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>/ {guide.title}</span>
          </summary>

          <div className="border-t px-4 pb-4 pt-3 sm:px-5" style={{ borderColor: "var(--line)" }}>
            <p className="narrative text-sm">{guide.body}</p>

            {guide.flow.length > 0 ? (
              <div className="mt-4">
                <p className="meta">The order work moves in</p>
                <ol className="mt-2 grid gap-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                  {guide.flow.map((line, index) => (
                    <li key={line} className="flex gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                        style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}
                      >
                        {index + 1}
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {guide.controls.length > 0 ? (
              <div className="mt-4">
                <p className="meta">What the controls do</p>
                <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {guide.controls.map(([label, does]) => (
                    <div key={label}>
                      <dt className="text-xs font-semibold" style={{ color: "var(--text)" }}>{label}</dt>
                      <dd className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>{does}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {shellTour ? (
                <button type="button" className="btn-ink !px-3.5 !py-1.5 text-xs" onClick={showAround}>
                  Show me around the workspace
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
                onClick={acknowledge}
              >
                Got it
              </button>
              <span className="meta">Shown once per page. Reopen it any time from this line.</span>
            </div>
          </div>
        </details>
      ) : null}

      {active ? <ProductTour steps={active.steps} onStep={step} onClose={finish} /> : null}
    </>
  );
}
