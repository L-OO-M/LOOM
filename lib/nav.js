import { PLANNER_ENABLED } from "./feature-flags";

export const workspaceAreas = ["student", "lead", "admin"];

/** The workspace whose chrome owns this path, or null for public routes. */
export function workspaceForPath(pathname) {
  return (
    workspaceAreas.find(
      (area) => pathname === `/${area}` || pathname?.startsWith(`/${area}/`),
    ) ?? null
  );
}

// Navigation model: five verbs. Learn / Build / Prove / Connect / Discover.
// Every destination keeps a stable URL — groups only change presentation.
// Icons stay in AppShell (JSX-side); this module holds ids, labels, hrefs.
// Aliases exist only for active-state matching (demoted or dynamic routes).
export const studentNav = [
  { id: "dashboard", label: "Home", icon: "home", href: "/student" },
  {
    id: "learn", label: "Learn", icon: "book", href: "/student/roadmap",
    children: [
      { id: "roadmap", label: "Roadmap", icon: "book", href: "/student/roadmap", desc: "Your path, node by node" },
      ...(PLANNER_ENABLED ? [{ id: "planner", label: "Planner", icon: "calendar", href: "/student/planner", desc: "The 28-week collective calendar" }] : []),
      { id: "resources", label: "Resources", icon: "library", href: "/student/resources", desc: "The curated library" }
    ]
  },
  {
    id: "build", label: "Build", icon: "kanban", href: "/student/projects",
    children: [
      { id: "projects", label: "Projects", icon: "kanban", href: "/student/projects", desc: "Ship and showcase" },
      { id: "github", label: "GitHub", icon: "branch", href: "/student/github", desc: "Proof of building" },
      { id: "opensource", label: "Open Source", icon: "pull", href: "/student/opensource", desc: "Claim PRs, earn badges" }
    ]
  },
  {
    id: "prove", label: "Prove", icon: "award", href: "/student/credentials",
    children: [
      { id: "proof", label: "Proof", icon: "award", href: "/student/credentials", desc: "Credentials that travel" },
      { id: "challenges", label: "Challenges", icon: "trophy", href: "/student/contests", desc: "Contests with deadlines" },
      { id: "standings", label: "Standings", icon: "chart", href: "/student/leaderboard", desc: "Where the chapter stands" }
    ]
  },
  {
    id: "connect", label: "Connect", icon: "handshake", href: "/student/mentorship",
    children: [
      { id: "mentors", label: "Mentors", icon: "handshake", href: "/student/mentorship", desc: "Guidance from seniors" },
      { id: "help", label: "Help", icon: "life-buoy", href: "/student/help", desc: "Stuck? Ask the chapter" },
      { id: "community", label: "Community", icon: "chat", href: "/student/community", desc: "Forums, wiki, snippets" },
      { id: "events", label: "Events", icon: "calendar", href: "/student/events", desc: "Workshops and hackathons" }
    ]
  },
  {
    id: "discover", label: "Discover", icon: "compass", href: "/student/discover",
    children: [
      { id: "people", label: "People", icon: "compass", href: "/student/discover", desc: "Builders in your college" },
      { id: "chapters", label: "Chapters", icon: "network", href: "/student/network", desc: "Campuses in the federation" },
      { id: "ideas", label: "Ideas", icon: "lightbulb", href: "/student/feature-requests", desc: "Shape what gets built" }
    ]
  }
];

export const studentSecondary = [
  { id: "notifications", label: "Inbox", icon: "bell", href: "/student/notifications" },
  { id: "settings", label: "Settings", icon: "settings", href: "/student/settings" }
];

// Demoted or dynamic routes: kept alive, matched for highlight only.
export const studentAliases = [
  { id: "dashboard", href: "/student/insights" },
  { id: "dashboard", href: "/student/onboarding" },
  { id: "settings", href: "/student/privacy" },
  { id: "proof", href: "/student/certificates" },
  { id: "ideas", href: "/student/feature-requests" }
];

// Five product worlds — brand constant, visual language distinct.
export const worldForTab = {
  dashboard: "public",
  roadmap: "learn",
  planner: "learn",
  resources: "learn",
  projects: "build",
  github: "build",
  opensource: "build",
  proof: "prove",
  challenges: "prove",
  standings: "prove",
  mentors: "connect",
  help: "connect",
  community: "connect",
  events: "connect",
  people: "discover",
  chapters: "discover",
  notifications: "connect",
  settings: "public",
};

export const adminNav = [
  { id: "overview", label: "Overview", icon: "chart", href: "/admin" },
  {
    id: "people", label: "People", icon: "users", href: "/admin/students",
    children: [
      { id: "students", label: "Students", icon: "users", href: "/admin/students", desc: "Roster and detail" },
      { id: "mentors", label: "Mentors", icon: "handshake", href: "/admin/mentors", desc: "Guides and sessions" },
      { id: "departments", label: "Departments", icon: "network", href: "/admin/departments", desc: "Create and archive" }
    ]
  },
  {
    id: "content", label: "Content", icon: "book", href: "/admin/roadmaps",
    children: [
      { id: "roadmaps", label: "Roadmaps", icon: "book", href: "/admin/roadmaps", desc: "Paths and nodes" },
      { id: "resources", label: "Resources", icon: "library", href: "/admin/resources", desc: "Curated library" },
      { id: "opensource", label: "OSS", icon: "pull", href: "/admin/opensource", desc: "Tracked repos and claims" },
      { id: "community", label: "Community", icon: "chat", href: "/admin/community", desc: "Flags and wiki queue" }
    ]
  },
  {
    id: "programs", label: "Programs", icon: "trophy", href: "/admin/contests",
    children: [
      { id: "contests", label: "Contests", icon: "trophy", href: "/admin/contests", desc: "Challenges and judging" },
      { id: "events", label: "Events", icon: "calendar", href: "/admin/events", desc: "Schedule and check-in" },
      ...(PLANNER_ENABLED ? [{ id: "planner", label: "Planner", icon: "calendar", href: "/admin/planner", desc: "28-week collective calendar" }] : []),
      { id: "projects", label: "Projects", icon: "kanban", href: "/admin/projects", desc: "Student builds" }
    ]
  },
  {
    id: "chapter", label: "Chapter", icon: "library", href: "/lead/assets",
    children: [
      { id: "assets", label: "Assets", icon: "library", href: "/lead/assets", desc: "Shared creative shelf" },
      { id: "mous", label: "MoUs", icon: "scroll", href: "/lead/mous", desc: "Agreements and expiry" },
      { id: "event-ops", label: "Event Ops", icon: "calendar", href: "/lead/event-ops", desc: "Tasks and deadlines" }
    ]
  },
  {
    id: "trust", label: "Trust", icon: "stamp", href: "/admin/verification",
    children: [
      { id: "verification", label: "Proof", icon: "stamp", href: "/admin/verification", desc: "Badges and issuance" },
      { id: "ranking", label: "Review", icon: "stamp", href: "/admin/ranking", desc: "Confirm claimed evidence" },
      { id: "analytics", label: "Data", icon: "chartbar", href: "/admin/analytics", desc: "Cohort health" },
      { id: "finance", label: "Finance", icon: "trending", href: "/admin/finance", desc: "Budgets and sponsors" },
      { id: "reports", label: "Reports", icon: "scroll", href: "/admin/reports", desc: "Department submissions" }
    ]
  },
  {
    id: "system", label: "System", icon: "settings", href: "/admin/settings",
    children: [
      { id: "settings", label: "Settings", icon: "settings", href: "/admin/settings", desc: "Chapter configuration" },
      { id: "handover", label: "Handover", icon: "shield", href: "/admin/handover", desc: "Transfer checklist" },
      { id: "flags", label: "Flags", icon: "flag", href: "/admin/flags", desc: "Feature switches" },
      { id: "faq", label: "FAQ", icon: "chat", href: "/admin/faq", desc: "Public questions" },
      { id: "audit", label: "Audit", icon: "scroll", href: "/admin/audit", desc: "Admin action log" },
      { id: "ideas", label: "Ideas", icon: "lightbulb", href: "/admin/feature-requests", desc: "Wishlist review" }
    ]
  }
];

// Lead sections are real routes, not on-page tabs and not hash anchors. The
// console used to render its own pill bar over these same five sections while
// this list pointed at #roster / #workshops — two navigation systems on one
// screen. Routes give each section a shareable URL and make back/refresh work.
export const leadNav = [
  { id: "console", label: "Console", icon: "chart", href: "/lead/overview" },
  { id: "roster", label: "Roster", icon: "users", href: "/lead/roster" },
  { id: "workshops", label: "Workshops", icon: "calendar", href: "/lead/workshops" },
  { id: "challenges", label: "Challenges", icon: "trophy", href: "/lead/challenges" },
  ...(PLANNER_ENABLED ? [{ id: "planner", label: "Planner", icon: "calendar", href: "/lead/planner" }] : []),
  { id: "reports", label: "Reports", icon: "scroll", href: "/lead/reports" },
  { id: "succession", label: "Succession", icon: "shield", href: "/lead/succession" },
  {
    id: "chapter", label: "Chapter", icon: "library", href: "/lead/assets",
    children: [
      { id: "assets", label: "Assets", icon: "library", href: "/lead/assets", desc: "Logos, templates, decks" },
      { id: "directory", label: "Directory", icon: "users", href: "/lead/directory", desc: "Leads and heads, current and past" },
      { id: "mous", label: "MoUs", icon: "scroll", href: "/lead/mous", desc: "Agreements and expiry" },
      { id: "event-ops", label: "Event Ops", icon: "calendar", href: "/lead/event-ops", desc: "Tasks and deadlines" }
    ]
  }
];

// Six destinations, six grid columns. Proof and Challenges were both in the
// "prove" group and duplicated one slot while Discover crowded out the member's
// own profile; Discover and Credentials now live inside the profile sheet, so
// nothing became unreachable.
export const mobileNav = [
  { group: null, label: "Home", icon: "home", href: "/student" },
  { group: "learn", label: "Learn", icon: "book", href: "/student/roadmap" },
  { group: "build", label: "Build", icon: "kanban", href: "/student/projects" },
  { group: "prove", label: "Prove", icon: "trophy", href: "/student/contests" },
  { group: "connect", label: "Connect", icon: "chat", href: "/student/community" },
  { group: null, label: "You", icon: "profile", href: "/student/settings", sheet: true }
];

// Leaf pages match before their group so activeTab stays a real destination
// (group hrefs intentionally duplicate their first child's href).
// Exact match wins; otherwise the longest href prefix wins so that "/" style
// home entries never swallow deeper pages.
export function matchLeaf(pool, pathname) {
  const leaves = pool.flatMap((n) => (n.children ? n.children : [n]));
  const exact = leaves.find((n) => pathname === n.href);
  if (exact) return exact;
  const prefixed = leaves
    .filter((n) => pathname.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length);
  return prefixed[0] || null;
}

export function pathToTab(pathname, area) {
  if (area === "admin") {
    return matchLeaf(adminNav, pathname)?.id ?? "overview";
  }
  if (area === "lead") {
    return matchLeaf(leadNav, pathname)?.id ?? "console";
  }
  if (pathname === "/student") return "dashboard";
  const pool = [...studentNav, ...studentSecondary, ...studentAliases];
  const leaves = pool.flatMap((n) => (n.children ? n.children : [n]));
  // Exact matches first — so demoted routes fold into their owner
  // before the "/" home leaf can swallow anything by prefix.
  const exact = leaves.find((n) => pathname === n.href);
  if (exact) return exact.id;
  // Any other single-segment student path is a public username.
  if (/^\/student\/[^/]+$/.test(pathname)) return "people";
  return matchLeaf(pool, pathname)?.id ?? "dashboard";
}

export function groupForTab(pool, tabId) {
  return pool.find((n) => n.id === tabId || n.children?.some((c) => c.id === tabId)) || null;
}

/**
 * Which areas open a dropdown from the top bar. Students get one link per verb:
 * their sibling destinations live in the in-page SectionRails, which are real
 * URLs. Admin and lead keep menus because their sections are not all rail-backed.
 */
export function usesDropdowns(area) {
  return area === "admin" || area === "lead";
}


export const publicNav = [
  ["Home", "/"], ["About", "/about"], ["Domains", "/domains"],
  ["Events", "/events"], ["FAQ", "/faq"],
];
