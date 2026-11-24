"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { PageTour } from "@/components/tour/PageTour";
import { ProductTour } from "@/components/tour/ProductTour";
import { guideForPath, guideStorageKey } from "@/lib/page-guides";
import { tourForArea, tourStorageKey } from "@/lib/tour";
import { track } from "@/lib/track-client";

/**
 * Onboarding layer for the three private workspaces.
 *
 * The page explains itself, in place: `PageTour` walks the sections of the page
 * you are on, once per member, with no permanent box at the top of the screen.
 * The workspace walkthrough (the top nav) is never automatic - it is only run
 * when someone asks for it, from Settings or `?tour=nav`.
 *
 * Seen-state is the profile's `tour_state` (written by /api/telemetry, read once
 * per tab here) with a localStorage mirror for the first paint.
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
  const [navTour, setNavTour] = useState(null);
  const [forced, setForced] = useState(false);
  const navRef = useRef(null);
  navRef.current = navTour;

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

  const guide = useMemo(() => (ready ? guideForPath(pathname, tourState) : null), [ready, pathname, tourState]);
  const guideSeen = !!guide && (guide.seen || readLocal(guideStorageKey(userId, guide)) === "done");

  // `?tour=page` replays the page walkthrough, `?tour=nav` (or `?tour=1`) the
  // workspace one. Nothing else starts the nav tour.
  useEffect(() => {
    if (!ready) return;
    const requested = new URLSearchParams(window.location.search).get("tour");
    if (!requested) return;
    if (requested === "page") {
      setForced(true);
      return;
    }
    const shell = tourForArea(area);
    if (shell) setNavTour(shell);
  }, [area, ready]);

  const rememberGuide = useCallback(
    (entry, reason) => {
      writeLocal(guideStorageKey(userId, entry), "done");
      setTourState((previous) => ({ ...(previous || {}), [entry.id]: entry.version }));
      setForced(false);
      track(reason === "skip" ? "tour_skip" : "tour_complete", {
        path: pathname,
        target: entry.id,
        metadata: { tour: entry.id, version: entry.version, reason: reason || "complete" }
      });
    },
    [pathname, userId]
  );

  const finishNav = useCallback(
    (reason) => {
      const shell = navRef.current;
      setNavTour(null);
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
    },
    [pathname, userId]
  );

  // Settings asks for the workspace walkthrough through this event, so it does
  // not need to know which component owns the overlay.
  useEffect(() => {
    function onStart(event) {
      const shell = tourForArea(event?.detail?.area || area);
      if (shell) setNavTour(shell);
    }
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, [area]);

  return (
    <>
      {guide && (forced || !guideSeen) ? (
        <PageTour
          guide={guide}
          enabled={!navTour}
          onSeen={rememberGuide}
        />
      ) : null}
      {navTour ? (
        <ProductTour
          steps={navTour.steps}
          onStep={(index, current) =>
            track("tour_step", {
              path: pathname,
              target: current.id,
              metadata: { tour: navTour.id, version: navTour.version, step: index + 1, step_id: current.id }
            })
          }
          onClose={finishNav}
        />
      ) : null}
    </>
  );
}
