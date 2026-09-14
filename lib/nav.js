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
      { id: "community", label: "Community", icon: "chat", href: "/student/community", desc: "Forums, wiki, snippets" },
      { id: "events", label: "Events", icon: "calendar", href: "/student/events", desc: "Workshops and hackathons" }
    ]
  },
  {
    id: "discover", label: "Discover", icon: "compass", href: "/student/discover",
    children: [
      { id: "people", label: "People", icon: "compass", href: "/student/discover", desc: "Builders in your college" },
      { id: "chapters", label: "Chapters", icon: "network", href: "/student/network", desc: "Campuses in the federation" }
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
  { id: "proof", href: "/student/certificates" }
];

export const adminNav = [
  { id: "overview", label: "Overview", icon: "chart", href: "/admin" },
  {
    id: "people", label: "People", icon: "users", href: "/admin/students",
    children: [
      { id: "students", label: "Students", icon: "users", href: "/admin/students", desc: "Roster and detail" },
      { id: "mentors", label: "Mentors", icon: "handshake", href: "/admin/mentors", desc: "Guides and sessions" }
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
      { id: "projects", label: "Projects", icon: "kanban", href: "/admin/projects", desc: "Student builds" }
    ]
  },
  {
    id: "trust", label: "Trust", icon: "stamp", href: "/admin/verification",
    children: [
      { id: "verification", label: "Proof", icon: "stamp", href: "/admin/verification", desc: "Badges and issuance" },
      { id: "analytics", label: "Data", icon: "chartbar", href: "/admin/analytics", desc: "Cohort health" }
    ]
  },
  {
    id: "system", label: "System", icon: "settings", href: "/admin/settings",
    children: [
      { id: "settings", label: "Settings", icon: "settings", href: "/admin/settings", desc: "Chapter configuration" },
      { id: "flags", label: "Flags", icon: "flag", href: "/admin/flags", desc: "Feature switches" },
      { id: "audit", label: "Audit", icon: "scroll", href: "/admin/audit", desc: "Admin action log" }
    ]
  }
];

export const leadNav = [
  { id: "console", label: "Console", icon: "chart", href: "/lead" },
  { id: "roster", label: "Roster", icon: "users", href: "/lead#roster" },
  { id: "workshops", label: "Workshops", icon: "calendar", href: "/lead#workshops" }
];

export const mobileNav = [
  { group: null, label: "Home", icon: "home", href: "/student" },
  { group: "learn", label: "Learn", icon: "book", href: "/student/roadmap" },
  { group: "build", label: "Build", icon: "kanban", href: "/student/projects" },
  { group: "connect", label: "Connect", icon: "chat", href: "/student/community" },
  { group: "prove", label: "Proof", icon: "award", href: "/student/credentials" }
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
    return "console";
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
