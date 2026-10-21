import { SectionTabs } from "@/components/loom/SectionTabs";

// One definition per rail so the four community pages, the two people pages,
// and the two help pages can never drift apart on labels or order.

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

export function CommunityTabs({ active, counts = null, className = "mt-8" }) {
  return <SectionTabs tabs={withCounts(COMMUNITY_TABS, counts)} active={active} label="Community rooms" className={className} />;
}

export function DiscoverTabs({ active, className = "mt-8" }) {
  return <SectionTabs tabs={DISCOVER_TABS} active={active} label="Discover views" className={className} />;
}

export function ConnectTabs({ active, className = "mt-8" }) {
  return <SectionTabs tabs={CONNECT_TABS} active={active} label="Connect views" className={className} />;
}
