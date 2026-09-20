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
  MessagesSquare, Moon, Settings, Stamp, Sun, TrendingUp, Users, FolderKanban, Trophy, Handshake, Bell, ScrollText, ShieldCheck, Network, Lightbulb
} from "lucide-react";
import { adminNav, groupForTab, leadNav, mobileNav, pathToTab, studentNav, studentSecondary } from "@/lib/nav";
import { FeatureRequestFab } from "./FeatureRequestFab";

const icons = {
  home: Home, book: BookOpen, library: Library, trending: TrendingUp, kanban: FolderKanban,
  branch: GitBranch, pull: GitPullRequest, trophy: Trophy, calendar: CalendarDays, chart: ChartNoAxesCombined,
  handshake: Handshake, chat: MessagesSquare, network: Network, compass: Compass, award: Award,
  users: Users, stamp: Stamp, chartbar: BarChart3, settings: Settings, flag: Flag, scroll: ScrollText,
  bell: Bell, shield: ShieldCheck, lightbulb: Lightbulb
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
  useRoleSync(true);
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
                      prefetch={true}
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
                                prefetch={true}
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
              {area === "student" && <MyProfileLink user={user} />}
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

        <div className="pt-20 pb-24 md:pb-10"><div className="shell">{children}</div></div>

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
        {area === "student" && <FeatureRequestFab />}
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

/* Same-login propagation (polling — no realtime sockets). Lightweight
   /api/profile check on visibility + 30s interval; on role/vertical change
   triggers router.refresh() so server components re-run getRequestContext
   and the UI instantly reflects new capabilities. Pooler-safe: one tiny
   query per poll, no extra connections. */
function useRoleSync(enabled) {
  const router = useRouter();
  const last = useRef(null);
  const check = useCallback(async () => {
    try {
      const d = await fetch("/api/profile", { cache: "no-store" }).then((r) => r.json());
      const p = d?.data?.profile;
      if (!p) return;
      const key = `${p.role}|${p.vertical ?? ""}|${(p.memberships || []).map((m) => `${m.department_id}:${m.level}`).sort().join(",")}`;
      if (last.current === null) {
        last.current = key;
        return;
      }
      if (key !== last.current) {
        last.current = key;
        router.refresh();
      }
    } catch {
      // poll is best-effort; network failures never break the shell
    }
  }, [router]);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(check, 30000);
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, check]);
}

function MyProfileLink({ user: propUser }) {
  const [card, setCard] = useState(null);
  const [profile, setProfile] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const router = useRouter();
  useEffect(() => {
    fetch("/api/social/profile", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (d?.ok && d.data?.card) setCard(d.data.card);
    }).catch(() => {});
    fetch("/api/profile", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (d?.ok && d.data?.profile) setProfile(d.data.profile);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, []);
  // Show immediately from propUser to avoid blank → pop-in delay
  const fallbackName = propUser?.email?.split("@")[0] || profile?.name || card?.username || "You";
  const username = card?.username || fallbackName.toLowerCase().replace(/\s+/g, "-").slice(0, 20);
  const isPublic = !!card?.is_public;
  const role = profile?.role || "student";
  const canLead = ["dept_lead", "vertical_lead", "admin"].includes(role);
  const canAdmin = ["admin"].includes(role);
  const initials = (card?.username || fallbackName).slice(0, 2).toUpperCase();
  const showAsClaim = !card?.username;
  const workspaces = [
    { label: "Student", href: "/student", desc: "Learn / Build / Prove", active: true },
    ...(canLead ? [{ label: "Lead", href: "/lead", desc: "Department / Vertical console" }] : []),
    ...(canAdmin ? [{ label: "Admin", href: "/admin", desc: "Chapter operations" }] : []),
  ];
  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border px-2 py-1.5 pr-3 transition hover:opacity-90"
        style={{ borderColor: isPublic ? "var(--accent)" : "var(--line)", background: isPublic ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "var(--bg-elevated)" }}
        title={isPublic ? "Your public card — share anywhere" : "Your card is private"}
      >
        <span className="grid size-7 place-items-center rounded-full text-xs font-bold shrink-0" style={{ background: isPublic ? "var(--accent)" : "var(--bg-muted)", color: isPublic ? "#101314" : "var(--text)" }}>{initials}</span>
        <span className="hidden lg:block text-xs font-semibold text-left" style={{ color: "var(--text)" }}>
          <span className="block leading-none">@{username}</span>
          <span className="block text-[10px] font-normal leading-none" style={{ color: "var(--text-muted)" }}>{role.replace("_", " ")}{isPublic ? " · public" : " · private"}</span>
        </span>
        <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            role="menu"
            className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border p-2 shadow-xl"
            style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
          >
            <div className="px-3 py-2">
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>@{username}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{role.replace("_", " ")}{card?.is_public ? " · Public card" : " · Private card"}</p>
            </div>
            <div className="my-1 h-px" style={{ background: "var(--line)" }} />
            {isPublic ? (
              <Link href={`/u/${username}`} prefetch={false} role="menuitem" onClick={() => setOpen(false)} className="row-link flex items-center gap-3 px-3 py-2.5">
                <span className="grid size-7 place-items-center rounded-full text-xs" style={{ background: "var(--accent)", color: "#101314" }}>↗</span>
                <span><span className="block text-sm font-medium" style={{ color: "var(--text)" }}>View public card</span><span className="block text-xs" style={{ color: "var(--text-muted)" }}>loom.sh/u/{username} · unfurls on Discord</span></span>
              </Link>
            ) : (
              <Link href={showAsClaim ? "/student/discover" : `/student/${username}`} prefetch={false} role="menuitem" onClick={() => setOpen(false)} className="row-link flex items-center gap-3 px-3 py-2.5">
                <span className="grid size-7 place-items-center rounded-full border text-xs" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>✎</span>
                <span><span className="block text-sm font-medium" style={{ color: "var(--text)" }}>{showAsClaim ? "Claim public card" : "View private card"}</span><span className="block text-xs" style={{ color: "var(--text-muted)" }}>{showAsClaim ? "Pick a username — share like Spotify" : "Make it public to share"}</span></span>
              </Link>
            )}
            <Link href="/student/settings" prefetch={false} role="menuitem" onClick={() => setOpen(false)} className="row-link flex items-center gap-3 px-3 py-2.5">
              <Settings size={14} style={{ color: "var(--text-muted)" }} />
              <span className="text-sm" style={{ color: "var(--text)" }}>Settings & privacy</span>
            </Link>
            <div className="my-1 h-px" style={{ background: "var(--line)" }} />
            <p className="px-3 py-1 text-[11px] font-semibold tracking-widest" style={{ color: "var(--text-muted)" }}>SWITCH WORKSPACE</p>
            {workspaces.map((w) => (
              <button
                key={w.href}
                role="menuitem"
                onClick={() => { setOpen(false); router.push(w.href); }}
                className="row-link flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <span className="grid size-7 place-items-center rounded-full border text-[10px] font-bold" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>{w.label[0]}</span>
                <span><span className="block text-sm font-medium" style={{ color: "var(--text)" }}>{w.label}</span><span className="block text-xs" style={{ color: "var(--text-muted)" }}>{w.desc}</span></span>
              </button>
            ))}
            {!canLead && !canAdmin && <p className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>Lead/Admin appears when your role is elevated by an admin.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
