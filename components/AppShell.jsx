"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/lib/theme";
import { BrandMark } from "./BrandMark";
import {
  Award, BarChart3, BookOpen, CalendarDays, ChartNoAxesCombined, ChevronDown, Compass, Flag, GitBranch, GitPullRequest, Home, Library, LogOut,
  MessagesSquare, Moon, Settings, Stamp, Sun, TrendingUp, Users, FolderKanban, Trophy, Handshake, Bell, ScrollText, ShieldCheck, Network
} from "lucide-react";
import { adminNav, groupForTab, mobileNav, pathToTab, studentNav, studentSecondary } from "@/lib/nav";

const icons = {
  home: Home, book: BookOpen, library: Library, trending: TrendingUp, kanban: FolderKanban,
  branch: GitBranch, pull: GitPullRequest, trophy: Trophy, calendar: CalendarDays, chart: ChartNoAxesCombined,
  handshake: Handshake, chat: MessagesSquare, network: Network, compass: Compass, award: Award,
  users: Users, stamp: Stamp, chartbar: BarChart3, settings: Settings, flag: Flag, scroll: ScrollText,
  bell: Bell, shield: ShieldCheck
};

const TabContext = createContext({ activeTab: "dashboard", setActiveTab: () => {} });

export function useTab() {
  return useContext(TabContext);
}

// Nav model (grouped tabs, leaf matching) lives in lib/nav.js - single source
// of truth shared with unit tests. Icons resolve through the map above.

export function AppShell({ area = "student", tenant, user, children }) {
  const { theme, toggle, mounted } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const tabs = area === "admin" ? adminNav : studentNav;
  const activeTab = pathToTab(pathname || "", area);
  const activeGroup = groupForTab(tabs, activeTab);
  const email = user?.email ?? "";
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);

  // Close the dropdown on route change or outside interaction.
  useEffect(() => { setOpenMenu(null); }, [pathname]);
  useEffect(() => {
    function onDown(e) {
      if (e.key === "Escape") setOpenMenu(null);
    }
    function onClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(null);
    }
    document.addEventListener("keydown", onDown);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onDown);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  const ctx = useMemo(() => ({
    activeTab,
    setActiveTab: (id) => {
      const pool = area === "admin" ? adminNav : [...studentNav, ...studentSecondary];
      const flat = pool.flatMap((n) => (n.children ? [n, ...n.children] : [n]));
      const target = flat.find((n) => n.id === id);
      if (target) router.push(target.href);
    }
  }), [activeTab, area, router]);

  return (
    <TabContext.Provider value={ctx}>
      <div className="min-h-[100dvh]" style={{ background: "var(--bg)" }}>
        <nav className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b px-4 sm:px-6" style={{ borderColor: "var(--line)", background: "var(--nav-bg)", backdropFilter: "blur(16px)" }}>
          <div className="flex min-w-0 items-center gap-4">
            <BrandMark size={26} />
            <div ref={menuRef} className="flex max-w-full items-center gap-1 rounded-full border px-1.5 py-1" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              {tabs.map((item) => {
                const Icon = icons[item.icon] || Home;
                const groupActive = activeGroup?.id === item.id;
                const pill = "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all active:scale-[0.97]";
                const pillStyle = {
                  background: groupActive ? "var(--text)" : "transparent",
                  color: groupActive ? "var(--bg)" : "var(--text-muted)"
                };
                if (!item.children) {
                  return (
                    <Link key={item.id} href={item.href} className={pill} style={pillStyle}>
                      <Icon size={15} strokeWidth={1.5} />
                      <span className="hidden md:inline">{item.label}</span>
                    </Link>
                  );
                }
                const open = openMenu === item.id;
                return (
                  <div key={item.id} className="relative shrink-0">
                    <button
                      onClick={() => setOpenMenu(open ? null : item.id)}
                      aria-haspopup="menu"
                      aria-expanded={open}
                      className={pill}
                      style={pillStyle}
                    >
                      <Icon size={15} strokeWidth={1.5} />
                      <span className="hidden md:inline">{item.label}</span>
                      <ChevronDown size={13} strokeWidth={2} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                    </button>
                    {open && (
                      <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border p-1.5 shadow-xl" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                        {item.children.map((child) => {
                          const ChildIcon = icons[child.icon] || Home;
                          const childActive = activeTab === child.id;
                          return (
                            <Link
                              key={child.id}
                              href={child.href}
                              role="menuitem"
                              className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[var(--bg-muted)]"
                              style={{ background: childActive ? "var(--bg-muted)" : "transparent" }}
                            >
                              <span className="mt-0.5 shrink-0" style={{ color: childActive ? "var(--accent)" : "var(--text-muted)" }}>
                                <ChildIcon size={16} strokeWidth={1.5} />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-medium" style={{ color: "var(--text)" }}>{child.label}</span>
                                {child.desc && <span className="block truncate text-xs" style={{ color: "var(--text-muted)" }}>{child.desc}</span>}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {area === "student" && studentSecondary.map((item) => {
                const Icon = icons[item.icon] || Home;
                const isActive = activeTab === item.id;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-all active:scale-[0.97]"
                    style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}
                    aria-label={item.label}
                  >
                    <Icon size={15} strokeWidth={1.5} />
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-xs sm:block" style={{ color: "var(--text-muted)" }}>{email}</span>
            <button
              onClick={toggle}
              className="rounded-lg p-2 transition hover:bg-[var(--bg-muted)] active:scale-[0.93]"
              style={{ color: "var(--text-muted)" }}
              aria-label="Toggle theme"
            >
              {mounted && theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg p-2 transition hover:bg-[var(--bg-muted)] active:scale-[0.93]"
                style={{ color: "var(--text-muted)" }}
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </button>
            </form>
          </div>
        </nav>
        <div className="pt-14 pb-24 md:pb-0">{children}</div>
        {area === "student" && (
          <nav className="fixed inset-x-0 bottom-0 z-50 border-t px-2 pt-1 md:hidden" style={{ borderColor: "var(--line)", background: "var(--nav-bg)", backdropFilter: "blur(16px)", paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }} aria-label="Primary">
            <div className="grid grid-cols-5">
              {mobileNav.map((item) => {
                const Icon = icons[item.icon] || Home;
                const isActive = item.group ? activeGroup?.id === item.group : (pathname || "") === "/student";
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition active:scale-[0.96]"
                    style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}
                  >
                    <span className="h-0.5 w-6 rounded-full" style={{ background: isActive ? "var(--accent)" : "transparent" }} />
                    <Icon size={19} strokeWidth={isActive ? 2 : 1.5} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </TabContext.Provider>
  );
}
