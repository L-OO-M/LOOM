"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useTheme } from "@/lib/theme";
import { BrandMark } from "./BrandMark";
import { Drawer } from "./loom/Drawer";
import {
  Award, BarChart3, BookOpen, CalendarDays, ChartNoAxesCombined, ChevronDown, Compass, Flag, GitBranch, GitPullRequest, Home, Library, LogOut,
  MessagesSquare, Moon, Settings, Stamp, Sun, TrendingUp, Users, FolderKanban, Trophy, Handshake, Bell, ScrollText, ShieldCheck, Network
} from "lucide-react";
import { adminNav, groupForTab, leadNav, mobileNav, pathToTab, studentNav, studentSecondary } from "@/lib/nav";

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

// Nav model (five verbs, leaf matching) lives in lib/nav.js — single source
// of truth shared with unit tests. Icons resolve through the map above.

export function AppShell({ area = "student", tenant, user, children }) {
  const { theme, toggle, mounted } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const tabs = area === "admin" ? adminNav : area === "lead" ? leadNav : studentNav;
  const activeTab = pathToTab(pathname || "", area);
  const activeGroup = groupForTab(tabs, activeTab);
  const [openMenu, setOpenMenu] = useState(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const inbox = useInbox(area === "student");
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
      const pool = area === "admin" ? adminNav : area === "lead" ? leadNav : [...studentNav, ...studentSecondary];
      const flat = pool.flatMap((n) => (n.children ? [n, ...n.children] : [n]));
      const target = flat.find((n) => n.id === id);
      if (target) router.push(target.href);
    }
  }), [activeTab, area, router]);

  return (
    <TabContext.Provider value={ctx}>
      <div className="min-h-[100dvh]" style={{ background: "var(--bg)" }}>
        <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3 sm:px-6">
          <nav
            className="floatbar flex max-w-full items-center gap-1 rounded-full py-1.5 pl-3 pr-1.5"
            aria-label="Primary"
          >
            <BrandMark size={24} href={area === "admin" ? "/admin" : area === "lead" ? "/lead" : "/student"} className="mr-1" />
            {/* No scroll container here: overflow-x would clip the dropdown
                popups vertically. Icon-first pills fit every width instead. */}
            <div ref={menuRef} className="flex max-w-full items-center gap-0.5 overflow-visible">
              {tabs.map((item) => {
                const Icon = icons[item.icon] || Home;
                const groupActive = activeGroup?.id === item.id;
                if (!item.children) {
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      prefetch={false}
                      aria-label={item.label}
                      className={`nav-ink hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-2 text-sm font-medium transition sm:inline-flex ${groupActive ? "is-active" : ""}`}
                      style={{ color: groupActive ? "var(--text)" : "var(--text-muted)" }}
                    >
                      <Icon size={16} strokeWidth={groupActive ? 2 : 1.5} />
                      <span className="hidden lg:inline">{item.label}</span>
                    </Link>
                  );
                }
                const open = openMenu === item.id;
                // The last menu aligns right so it never spills past the viewport.
                const alignRight = item.id === tabs[tabs.length - 1].id;
                const menuX = alignRight ? "0%" : "-50%";
                return (
                  <div key={item.id} className="relative hidden shrink-0 sm:block">
                    <button
                      onClick={() => setOpenMenu(open ? null : item.id)}
                      aria-haspopup="menu"
                      aria-expanded={open}
                      aria-label={item.label}
                      className={`nav-ink flex items-center gap-1 rounded-full px-2.5 py-2 text-sm font-medium transition ${groupActive ? "is-active" : ""}`}
                      style={{ color: groupActive ? "var(--text)" : "var(--text-muted)" }}
                    >
                      <Icon size={16} strokeWidth={groupActive ? 2 : 1.5} />
                      <span className="hidden lg:inline">{item.label}</span>
                      <ChevronDown size={13} strokeWidth={2} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s var(--ease-out)" }} />
                    </button>
                    <AnimatePresence>
                      {open && (
                        <motion.div
                          role="menu"
                          initial={{ opacity: 0, x: menuX, y: 6, scale: 0.98 }}
                          animate={{ opacity: 1, x: menuX, y: 0, scale: 1 }}
                          exit={{ opacity: 0, x: menuX, y: 4, scale: 0.98 }}
                          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                          className={`absolute top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border p-1.5 shadow-xl ${alignRight ? "right-0" : "left-1/2"}`}
                          style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", transformOrigin: "top center" }}
                        >
                          {item.children.map((child) => {
                            const ChildIcon = icons[child.icon] || Home;
                            const childActive = activeTab === child.id;
                            return (
                              <Link
                                key={child.id}
                                href={child.href}
                                prefetch={false}
                                role="menuitem"
                                className="row-link flex items-start gap-3 px-3 py-2.5"
                                style={{ background: childActive ? "color-mix(in srgb, var(--accent) 7%, transparent)" : "transparent" }}
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
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
            <span className="mx-1 h-5 w-px shrink-0" style={{ background: "var(--line)" }} aria-hidden="true" />
            <div className="flex shrink-0 items-center">
              {area === "student" && <InboxBell unread={inbox.unread} onOpen={() => setInboxOpen(true)} />}
              <button
                onClick={toggle}
                className="rounded-full p-2 transition hover:bg-[var(--bg-muted)] active:scale-93"
                style={{ color: "var(--text-muted)" }}
                aria-label="Toggle theme"
              >
                {mounted && theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <Link
                href="/student/settings"
                prefetch={false}
                className="rounded-full p-2 transition hover:bg-[var(--bg-muted)] active:scale-93"
                style={{ color: activeTab === "settings" ? "var(--accent)" : "var(--text-muted)" }}
                aria-label="Settings"
              >
                <Settings size={16} />
              </Link>
              <form action="/auth/signout" method="post" className="hidden sm:block">
                <button
                  type="submit"
                  className="rounded-full p-2 transition hover:bg-[var(--bg-muted)] active:scale-93"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Sign out"
                >
                  <LogOut size={16} />
                </button>
              </form>
            </div>
          </nav>
        </header>

        <div className="pt-20 pb-24 md:pb-10">{children}</div>

        {area === "student" && (
          <nav className="fixed inset-x-3 bottom-3 z-50 md:hidden" aria-label="Primary mobile">
            <div className="floatbar grid grid-cols-6 rounded-3xl px-1 py-1.5">
              {mobileNav.map((item) => {
                const Icon = icons[item.icon] || Home;
                // Exact destination wins so two items sharing a group (e.g.
                // Challenges + Proof under "prove") never light up together.
                const current = pathname || "";
                const exactHit = mobileNav.some((m) => m.href === current);
                const isActive = current === item.href || (item.group ? activeGroup?.id === item.group && !exactHit : current === "/student");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className="flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[10px] font-semibold transition active:scale-95"
                    style={{ color: isActive ? "var(--text)" : "var(--text-muted)", background: isActive ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent" }}
                  >
                    <Icon size={19} strokeWidth={isActive ? 2 : 1.5} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

        {area === "student" && <InboxDrawer open={inboxOpen} onClose={() => setInboxOpen(false)} inbox={inbox} />}
      </div>
    </TabContext.Provider>
  );
}

/* One shared inbox fetch for the bell + drawer. Previously each fetched
   /api/notifications on its own (two authed API round-trips per page view:
   one on mount, one on open). Now the shell loads once and both read it;
   the drawer only refetches on open if the first load never completed. */
function useInbox(enabled) {
  const [items, setItems] = useState(null);
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/notifications").then((r) => r.json());
      if (d?.ok) {
        setItems(d.data?.notifications ?? []);
        setUnread(d.data?.unread ?? 0);
      } else {
        setItems((prev) => prev ?? []);
      }
    } catch {
      setItems((prev) => prev ?? []);
    }
  }, []);
  useEffect(() => { if (enabled) load(); }, [enabled, load]);
  const markRead = useCallback(async (n) => {
    if (n.read_at) return;
    setItems((prev) => (prev || []).map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" });
    } catch { /* optimistic; the list already moved on */ }
  }, []);
  return { items, unread, load, markRead };
}

/* Bell with a live unread dot — opens the inbox drawer, not a page. */
function InboxBell({ unread, onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="relative rounded-full p-2 transition hover:bg-[var(--bg-muted)] active:scale-93"
      style={{ color: "var(--text-muted)" }}
      aria-label={unread > 0 ? `Inbox, ${unread} unread` : "Inbox"}
    >
      <Bell size={16} />
      {unread > 0 && (
        <span
          className="absolute right-1 top-1 grid size-4 place-items-center rounded-full text-[9px] font-bold"
          style={{ background: "var(--accent)", color: "#101314" }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

/* Inbox drawer — the notification surface for everyday use.
   The full /student/notifications page remains for deep history. */
function InboxDrawer({ open, onClose, inbox }) {
  const { items, unread, load, markRead } = inbox;

  useEffect(() => {
    if (open && items === null) load();
  }, [open, items, load]);

  return (
    <Drawer open={open} onClose={onClose} label={unread > 0 ? `Inbox · ${unread} unread` : "Inbox"}>
      {items === null ? (
        <div aria-hidden="true">
          {[92, 78, 85].map((w, i) => <div key={i} className="skel mb-3" style={{ height: 56, width: `${w}%` }} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>All caught up</p>
          <p className="mx-auto mt-2 max-w-60 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            Mentions, reviews, and chapter news land here the moment they happen.
          </p>
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
          {items.slice(0, 12).map((n) => (
            <li key={n.id}>
              <Link
                href={n.link || "/student/notifications"}
                onClick={() => markRead(n)}
                className="row-link flex items-start gap-3 px-2 py-3"
              >
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full"
                  style={{ background: n.read_at ? "var(--line)" : "var(--accent)" }}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-5" style={{ color: "var(--text)" }}>{n.title}</span>
                  {n.body && <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--text-muted)" }}>{n.body}</span>}
                  <span className="meta mt-1 block">
                    {n.created_at ? new Date(n.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/student/notifications"
        onClick={onClose}
        className="mt-4 block text-center text-xs font-semibold hover:underline"
        style={{ color: "var(--accent)" }}
      >
        Full history →
      </Link>
    </Drawer>
  );
}
