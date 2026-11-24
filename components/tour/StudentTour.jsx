"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ProductTour } from "@/components/tour/ProductTour";
import { STUDENT_TOUR, TOUR_START_DELAY_MS, TOUR_VERSION, tourSeen, tourStorageKey } from "@/lib/tour";
import { track } from "@/lib/track-client";

/**
 * Decides whether the student tour should open.
 *
 * Three inputs, in order: `?tour=1` (an explicit replay), the profile's
 * `tour_state` (cross-device completion), and the localStorage mirror (avoids a
 * flash and keeps a second browser from re-asking). It only auto-starts on the
 * Home screen, so a deep link never interrupts a member mid-task.
 */
export function StudentTour({ userId, tourState }) {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const storageKey = tourStorageKey(userId, STUDENT_TOUR.id);

  useEffect(() => {
    if (pathname !== "/student") return;
    const forced = new URLSearchParams(window.location.search).get("tour") === "1";
    if (forced) {
      setActive(true);
      return;
    }
    let seen = false;
    try {
      seen = window.localStorage.getItem(storageKey) === "done";
    } catch {
      seen = false;
    }
    if (seen || tourSeen(tourState, STUDENT_TOUR.id)) return;
    const timer = setTimeout(() => setActive(true), TOUR_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname, storageKey, tourState]);

  useEffect(() => {
    if (!active) return;
    track("tour_start", {
      path: "/student",
      target: STUDENT_TOUR.id,
      metadata: { tour: STUDENT_TOUR.id, version: TOUR_VERSION }
    });
  }, [active]);

  function close(reason) {
    setActive(false);
    try {
      window.localStorage.setItem(storageKey, "done");
    } catch {
      // Storage disabled: the profile write still records completion.
    }
    track(reason === "complete" ? "tour_complete" : "tour_skip", {
      path: "/student",
      target: STUDENT_TOUR.id,
      metadata: { tour: STUDENT_TOUR.id, version: TOUR_VERSION, reason }
    });
    if (new URLSearchParams(window.location.search).get("tour") === "1") {
      window.history.replaceState(null, "", "/student");
    }
  }

  function step(index, current) {
    track("tour_step", {
      path: "/student",
      target: current.id,
      metadata: { tour: STUDENT_TOUR.id, version: TOUR_VERSION, step: index + 1, step_id: current.id }
    });
  }

  if (!active) return null;
  return <ProductTour steps={STUDENT_TOUR.steps} onStep={step} onClose={close} />;
}
