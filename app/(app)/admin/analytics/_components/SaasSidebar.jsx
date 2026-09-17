"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, CreditCard, FileText, Settings, User, Users,
  ShieldCheck, ChevronDown, BarChart3,
  MessageSquare, PenLine, Handshake, X,
} from "lucide-react";

const SECTIONS = [
  {
    title: "Manage",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/admin/analytics" },
      { id: "billing", label: "Billing", icon: CreditCard, href: "/admin/finance" },
      { id: "blog", label: "Blog", icon: FileText, href: "/student/community" },
      { id: "setting", label: "Setting", icon: Settings, href: "/admin/settings" },
    ],
  },
  {
    title: "Manage Accounts",
    items: [
      { id: "account", label: "Account", icon: User, href: "/admin/students" },
      { id: "user", label: "User", icon: Users, href: "/student/discover" },
      { id: "roles", label: "Roles & Permissions", icon: ShieldCheck, href: "/admin/students" },
      { id: "mentors", label: "Mentors", icon: Handshake, href: "/student/mentorship" },
    ],
  },
];

const GROUPS = [
  {
    id: "data", label: "Data Display", icon: BarChart3,
    children: [
      { label: "Analytics", href: "/admin/analytics" },
      { label: "Reports", href: "/admin/reports" },
      { label: "Audit log", href: "/admin/audit" },
    ],
  },
  {
    id: "feedback", label: "Feedback", icon: MessageSquare,
    children: [
      { label: "Inbox", href: "/student/notifications" },
      { label: "FAQ", href: "/admin/faq" },
    ],
  },
  {
    id: "inputs", label: "Inputs", icon: PenLine,
    children: [
      { label: "Contests", href: "/admin/contests" },
      { label: "Events", href: "/admin/events" },
    ],
  },
];

export const SAAS_NAV_INDEX = [
  ...SECTIONS.flatMap((s) => s.items.map((i) => ({ label: i.label, href: i.href }))),
  ...GROUPS.flatMap((g) => g.children.map((c) => ({ label: `${g.label} · ${c.label}`, href: c.href }))),
  { label: "Flags", href: "/admin/flags" },
  { label: "Departments", href: "/admin/departments" },
  { label: "Handover", href: "/admin/handover" },
];

function NavItem({ item, active, collapsed }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      prefetch={false}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${collapsed ? "justify-center" : ""}`}
      style={
        active
          ? { background: "var(--dash-accent-soft)", color: "var(--dash-accent-strong)" }
          : { color: "var(--text-muted)" }
      }
    >
      <Icon size={16} strokeWidth={active ? 2 : 1.6} className="shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function SidebarBody({ onNavigate }) {
  const pathname = usePathname();
  const [open, setOpen] = useState({ data: true, feedback: false, inputs: false });
  const isActive = (href) => pathname === href;
  return (
    <div className="flex-1 overflow-y-auto px-2.5 py-3" onClick={onNavigate}>
      {SECTIONS.map((sec, si) => (
        <div key={sec.title} className={si > 0 ? "mt-4 border-t pt-4" : ""} style={{ borderColor: "var(--line)" }}>
          <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
            {sec.title}
          </p>
          <div className="space-y-0.5">
            {sec.items.map((item) => (
              <NavItem key={item.id} item={item} active={isActive(item.href)} collapsed={false} />
            ))}
          </div>
        </div>
      ))}
      <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
        <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
          UI Elements
        </p>
        <div className="space-y-0.5">
          {GROUPS.map((g) => {
            const Icon = g.icon;
            const expanded = !!open[g.id];
            const childActive = g.children.some((c) => isActive(c.href));
            return (
              <div key={g.id}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setOpen((o) => ({ ...o, [g.id]: !o[g.id] })); }}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition"
                  style={{ color: childActive ? "var(--dash-accent-strong)" : "var(--text-muted)" }}
                >
                  <Icon size={16} strokeWidth={childActive ? 2 : 1.6} className="shrink-0" />
                  <span className="flex-1 truncate text-left">{g.label}</span>
                  <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.18s" }} />
                </button>
                {expanded && (
                  <div className="mb-1 ml-7 space-y-0.5">
                    {g.children.map((c) => (
                      <Link
                        key={c.label}
                        href={c.href}
                        prefetch={false}
                        aria-current={isActive(c.href) ? "page" : undefined}
                        className="block rounded-md px-2 py-1.5 text-[12.5px] transition hover:underline"
                        style={{ color: isActive(c.href) ? "var(--dash-accent-strong)" : "var(--text-muted)" }}
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SaasSidebar({ mobileOpen, onCloseMobile }) {
  // No persistent sidebar: navigation lives in the on-demand drawer so the
  // page stays full-width. Every destination stays reachable — same links,
  // same hrefs, plus header search (SAAS_NAV_INDEX) still covers them all.
  // `collapsed`/`onToggle` were removed with the fixed panel.
  if (!mobileOpen) return null;
  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Dashboard navigation">
      <div className="overlay" onClick={onCloseMobile} aria-hidden="true" />
      <aside
        className="drawer !left-0 !right-auto flex flex-col border-l-0 border-r"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex h-14 items-center justify-between border-b px-3" style={{ borderColor: "var(--line)" }}>
          <span className="flex items-center gap-1.5 text-[15px] font-bold" style={{ color: "var(--dash-accent-strong)" }}>
            <span className="grid size-6 place-items-center rounded-md text-[13px] text-white" style={{ background: "var(--dash-accent)" }} aria-hidden="true">
              S
            </span>
            SaaSable
          </span>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="rounded-md p-1.5 transition hover:bg-[var(--bg-muted)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={16} />
          </button>
        </div>
        <SidebarBody onNavigate={onCloseMobile} />
      </aside>
    </div>
  );
}
