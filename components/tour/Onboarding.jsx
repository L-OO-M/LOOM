"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ProductTour } from "@/components/tour/ProductTour";
import { introForPath, introStorageKey } from "@/lib/page-intros";
import { TOUR_START_DELAY_MS, tourForArea, tourSeen, tourStorageKey } from "@/lib/tour";
import { track } from "@/lib/track-client";

/**
 * Onboarding layer for the three private workspaces.
 *
 * Two things, one state machine:
 *  1. A one-time, in-flow intro banner for the current page. It sits above the
 *     page content instead of floating over it, so it can never swallow a click
 *     or cover the control someone is trying to use.
 *  2. The spotlight walkthrough for the workspace. The student tour still
 *     auto-starts on Home (the page where a walkthrough is welcome); lead and
 *     admin tours are started from the intro banner or Settings, so a console
 *     user is never interrupted mid-task.
 *
 * Seen-state is the profile's `tour_state` (written by /api/telemetry, read
 * once per tab here) with a localStorage mirror for the first paint. The banner
 * records its dismissal through the same tour events, which is why an intro is
 * just another tour id in that json.
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
  const [intro, setIntro] = useState(null);
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
      writeLocal(introStorageKey(userId, entry), "done");
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
      setIntro(null);
      setActive(shell);
    },
    [area]
  );

  // Resolve the current page's intro. Student Home is skipped on purpose: the
  // spotlight tour is the welcome there and two overlays would compete.
  useEffect(() => {
    if (!ready) return;
    const entry = introForPath(pathname, tourState);
    setIntro(null);
    if (!entry || entry.seen) return;
    if (readLocal(introStorageKey(userId, entry)) === "done") return;
    if (pathname === "/student") return;
    const timer = setTimeout(() => setIntro(entry), 450);
    return () => clearTimeout(timer);
  }, [pathname, ready, tourState, userId]);

  // `?tour=1` is an explicit replay and wins over "seen". Student Home then
  // auto-starts once; every other workspace opts in through the banner or
  // Settings so a console user is never interrupted mid-task.
  useEffect(() => {
    if (!ready || activeRef.current) return;
    const shell = tourForArea(area);
    if (!shell) return;
    const forced = new URLSearchParams(window.location.search).get("tour") === "1";
    if (forced) {
      setIntro(null);
      setActive(shell);
      return;
    }
    if (readLocal(tourStorageKey(userId, shell.id, shell.version)) === "done") return;
    if (tourSeen(tourState, shell.id, shell.version)) return;
    if (area !== "student" || pathname !== "/student") return;
    const timer = setTimeout(() => setActive(shell), TOUR_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [area, pathname, ready, tourState, userId]);

  // Settings and the intro banner ask for a tour through this event, so they do
  // not need to know which component owns the overlay.
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
    if (intro) remember(intro);
    setIntro(null);
  }

  function showAround() {
    if (intro) remember(intro);
    startTour();
  }

  const titleId = intro ? `intro-title-${intro.id}` : undefined;

  return (
    <>
      {intro ? (
        <section
          aria-labelledby={titleId}
          className="mb-6 rounded-2xl border p-4 sm:p-5"
          style={{
            borderColor: "color-mix(in srgb, var(--accent) 55%, var(--line))",
            background: "color-mix(in srgb, var(--accent) 5%, var(--bg-elevated))"
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="meta" style={{ color: "var(--accent)" }}>First time on this page</p>
              <h2 id={titleId} className="mt-1 text-base font-semibold" style={{ color: "var(--text)" }}>{intro.title}</h2>
              <p className="narrative mt-1.5 text-sm">{intro.body}</p>
              {intro.points.length > 0 ? (
                <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {intro.points.map((point) => (
                    <li key={point} className="flex gap-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                      <span aria-hidden="true" style={{ color: "var(--accent)" }}>-</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {tourForArea(area) ? (
                <button type="button" className="btn-ink !px-3.5 !py-1.5 text-xs" onClick={showAround}>
                  Show me around
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
            </div>
          </div>
          <p className="meta mt-2">Shown once per page. Replay the walkthrough any time from Settings.</p>
        </section>
      ) : null}

      {active ? <ProductTour steps={active.steps} onStep={step} onClose={finish} /> : null}
    </>
  );
}
