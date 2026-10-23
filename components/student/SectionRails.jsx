import { SectionTabs } from "@/components/loom/SectionTabs";
import { PLANNER_ENABLED } from "@/lib/feature-flags";

// One definition per rail so every page in a verb shares the same labels and
// order. Rails mirror studentNav children; tests/section-rails.test.js enforces
// that parity. Community rooms are a second-level rail under Connect.

export const LEARN_TABS = [
  { href: "/student/roadmap", label: "Roadmap" },
  ...(PLANNER_ENABLED ? [{ href: "/student/planner", label: "Planner" }] : []),
  { href: "/student/resources", label: "Resources" }
];

export const BUILD_TABS = [
  { href: "/student/projects", label: "Projects" },
  { href: "/student/github", label: "GitHub" },
  { href: "/student/opensource", label: "Open source" }
];

export const PROVE_TABS = [
  { href: "/student/credentials", label: "Proof" },
  { href: "/student/contests", label: "Challenges" },
  { href: "/student/leaderboard", label: "Standings" }
];

export const COMMUNITY_TABS = [
  { href: "/student/community", label: "Overview" },
  { href: "/student/community/forums", label: "Forums" },
  { href: "/student/community/wiki", label: "Wiki" },
  { href: "/student/community/snippets", label: "Snippets" }
];

export const DISCOVER_TABS = [
  { href: "/student/discover", label: "People" },
  { href: "/student/network", label: "Chapters" },
  { href: "/student/feature-requests", label: "Ideas" }
];

export const CONNECT_TABS = [
  { href: "/student/mentorship", label: "Mentors" },
  { href: "/student/help", label: "Peer help" },
  { href: "/student/community", label: "Community" },
  { href: "/student/events", label: "Events" }
];

function withCounts(tabs, counts) {
  if (!counts) return tabs;
  return tabs.map((t) => ({ ...t, count: counts[t.href] }));
}

export function LearnTabs({ active, className = "mt-6" }) {
  return <SectionTabs tabs={LEARN_TABS} active={active} label="Learn views" className={className} />;
}

export function BuildTabs({ active, className = "mt-6" }) {
  return <SectionTabs tabs={BUILD_TABS} active={active} label="Build views" className={className} />;
}

export function ProveTabs({ active, className = "mt-6" }) {
  return <SectionTabs tabs={PROVE_TABS} active={active} label="Prove views" className={className} />;
}

export function CommunityTabs({ active, counts = null, className = "mt-8" }) {
  return <SectionTabs tabs={withCounts(COMMUNITY_TABS, counts)} active={active} label="Community rooms" className={className} />;
}

export function DiscoverTabs({ active, className = "mt-8" }) {
  return <SectionTabs tabs={DISCOVER_TABS} active={active} label="Discover views" className={className} />;
}

export function ConnectTabs({ active, className = "mt-8" }) {
  return <SectionTabs tabs={CONNECT_TABS} active={active} label="Connect views" className={className} />;
}
