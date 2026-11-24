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

/**
 * Lead console walkthrough.
 *
 * Deliberately shorter than the list of sections: a tour earns its place by
 * explaining the four decisions a lead actually makes, not by reading the menu
 * back. Every target is a real `data-tour` slot in AppShell.
 */
export const LEAD_TOUR = Object.freeze({
  id: "lead",
  version: TOUR_VERSION,
  steps: Object.freeze([
    {
      id: "console",
      target: "[data-tour='nav-console']",
      placement: "bottom",
      title: "Start on the console",
      body: "Overview is the only screen that gathers what needs a lead: roster health, contribution output and decisions waiting on you."
    },
    {
      id: "departments",
      target: "[data-tour='nav-departments']",
      placement: "bottom",
      title: "Your departments",
      body: "Each department has a workspace with its roster, tasks and monthly report. Your scope decides which ones appear."
    },
    {
      id: "roster",
      target: "[data-tour='nav-roster']",
      placement: "bottom",
      title: "People and seats",
      body: "Approve Core requests, open a member for their contributions, and keep the roster honest. Role changes stay with admins."
    },
    {
      id: "events",
      target: "[data-tour='nav-events']",
      placement: "bottom",
      title: "Events and operations",
      body: "Schedule an event, then run its tasks from Event Ops. Turnout comes from door check-ins, not registrations."
    },
    {
      id: "programs",
      target: "[data-tour='nav-programs']",
      placement: "bottom",
      title: "Programs",
      body: "Challenges, the weekly practice set and the debug queue live here. These are the pages students act on."
    },
    {
      id: "reports",
      target: "[data-tour='nav-reports']",
      placement: "bottom",
      title: "Reports and exports",
      body: "Compile the month, read it, then submit. A submitted report is locked unless an admin reopens it."
    },
    {
      id: "usage",
      target: "[data-tour='nav-usage']",
      placement: "bottom",
      title: "Usage, without surveillance",
      body: "See which screens the chapter actually opens and where the tour loses people. Aggregates only - no per-member record exists."
    }
  ])
});

/** Admin walkthrough: one step per navigation group, because that is the IA. */
export const ADMIN_TOUR = Object.freeze({
  id: "admin",
  version: TOUR_VERSION,
  steps: Object.freeze([
    {
      id: "overview",
      target: "[data-tour='nav-overview']",
      placement: "bottom",
      title: "Start on Overview",
      body: "Chapter totals and the queues that need an admin. Open a queue card to act on it."
    },
    {
      id: "people",
      target: "[data-tour='nav-people']",
      placement: "bottom",
      title: "People",
      body: "Students, mentors, departments and seat requests. Role changes need a scope and a term end date."
    },
    {
      id: "content",
      target: "[data-tour='nav-content']",
      placement: "bottom",
      title: "Content",
      body: "Roadmaps, resources, tracked repositories and community moderation. Publishing here changes what students see."
    },
    {
      id: "programs",
      target: "[data-tour='nav-programs']",
      placement: "bottom",
      title: "Programs",
      body: "Contests, practice, debug challenges, events and projects. These are where student work is reviewed."
    },
    {
      id: "chapter",
      target: "[data-tour='nav-chapter']",
      placement: "bottom",
      title: "Chapter",
      body: "Assets, MoUs, the leadership directory, event operations and announcements - the chapter's shared machinery."
    },
    {
      id: "trust",
      target: "[data-tour='nav-trust']",
      placement: "bottom",
      title: "Trust and data",
      body: "Proof, evidence review, analytics, finance and department reports. Every number here states its denominator."
    },
    {
      id: "system",
      target: "[data-tour='nav-system']",
      placement: "bottom",
      title: "System",
      body: "Settings, handover, flags, the public FAQ, the audit log and the idea ledger. The audit log is append-only."
    }
  ])
});

export const SHELL_TOURS = Object.freeze({
  student: STUDENT_TOUR,
  lead: LEAD_TOUR,
  admin: ADMIN_TOUR
});

/** Retired ids stay readable so an old tour_state key does not look broken. */
export const SHELL_TOUR_IDS = Object.freeze(Object.keys(SHELL_TOURS));

export function tourForArea(area) {
  return SHELL_TOURS[area] || null;
}

export function tourStorageKey(userId, tourId, version = TOUR_VERSION) {
  return `loom-tour:${userId || "anon"}:${tourId}:${version}`;
}

/** True when the stored state already covers the shipped version. */
export function tourSeen(tourState, tourId, version = TOUR_VERSION) {
  const raw = tourState && typeof tourState === "object" ? tourState[tourId] : null;
  const stored = Number(raw);
  return Number.isFinite(stored) && stored >= version;
}
