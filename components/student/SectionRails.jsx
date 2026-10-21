import { SectionTabs } from "@/components/loom/SectionTabs";

// One definition per rail so the four community pages, the two people pages,
// the two help pages, and the three Learn surfaces can never drift apart on
// labels or order.

export const LEARN_TABS = [
  { href: "/student/roadmap", label: "Roadmap" },
  { href: "/student/planner", label: "Planner" },
  { href: "/student/resources", label: "Resources" }
];

export const COMMUNITY_TABS = [
  { href: "/student/community", label: "Overview" },
  { href: "/student/community/forums", label: "Forums" },
  { href: "/student/community/wiki", label: "Wiki" },
  { href: "/student/community/snippets", label: "Snippets" }
];

export const DISCOVER_TABS = [
  { href: "/student/discover", label: "People" },
  { href: "/student/network", label: "Chapters" }
];

export const CONNECT_TABS = [
  { href: "/student/mentorship", label: "Mentors" },
  { href: "/student/help", label: "Peer help" }
];

function withCounts(tabs, counts) {
  if (!counts) return tabs;
  return tabs.map((t) => ({ ...t, count: counts[t.href] }));
}

export function LearnTabs({ active, className = "mt-6" }) {
  return <SectionTabs tabs={LEARN_TABS} active={active} label="Learn views" className={className} />;
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
