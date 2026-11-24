/**
 * Product tour, as data.
 *
 * A tour is a versioned list of steps. Steps target `data-tour` attributes in
 * the shell rather than CSS classes, so a restyle cannot silently break the
 * tour, and the copy lives here instead of inside a 300-line component.
 *
 * Completion is per tour id and version: shipping a materially different
 * onboarding can bump `version`, and everyone sees it once more. The same state
 * is stored on the profile (written by /api/telemetry) and mirrored in
 * localStorage so the first paint does not flash.
 *
 * Pure: no window access. tests/tour.test.js covers the vocabulary and merging.
 */

export const TOUR_VERSION = 1;
export const TOUR_START_DELAY_MS = 900;

export const STUDENT_TOUR = Object.freeze({
  id: "student",
  version: TOUR_VERSION,
  steps: Object.freeze([
    {
      id: "home",
      target: "[data-tour='nav-dashboard']",
      placement: "bottom",
      title: "This is Home",
      body: "Your next step, this week's rhythm and anything waiting on a decision land here first."
    },
    {
      id: "learn",
      target: "[data-tour='nav-learn']",
      placement: "bottom",
      title: "Learn is the path",
      body: "Roadmap, the weekly practice set, the planner and the resource library all live under Learn."
    },
    {
      id: "build",
      target: "[data-tour='nav-build']",
      placement: "bottom",
      title: "Build in public",
      body: "Projects, assigned work, GitHub proof, open-source claims and debug bounties sit under Build."
    },
    {
      id: "prove",
      target: "[data-tour='nav-prove']",
      placement: "bottom",
      title: "Prove it",
      body: "Credentials, contests, standings and your own insights live under Prove. Evidence beats claims."
    },
    {
      id: "connect",
      target: "[data-tour='nav-connect']",
      placement: "bottom",
      title: "Connect",
      body: "Mentors, help requests, the community, sponsors and chapter events are one click from here."
    },
    {
      id: "settings",
      target: "[data-tour='nav-settings']",
      placement: "bottom",
      title: "Nothing is hidden",
      body: "Settings and your account live here. You can replay this tour from Settings whenever you want."
    }
  ])
});

export const TOURS = Object.freeze({ student: STUDENT_TOUR });

export function tourStorageKey(userId, tourId) {
  return `loom-tour:${userId || "anon"}:${tourId}:${TOUR_VERSION}`;
}

/** True when the stored state already covers the shipped version. */
export function tourSeen(tourState, tourId) {
  const raw = tourState && typeof tourState === "object" ? tourState[tourId] : null;
  const version = Number(raw);
  return Number.isFinite(version) && version >= TOUR_VERSION;
}
