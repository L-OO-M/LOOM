"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, Bell, Sun, Moon, ChevronRight, Menu, ChevronDown, LogOut, UserRound, Settings } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { SAAS_NAV_INDEX } from "./SaasSidebar";

const ROLE_LABEL = { platform_admin: "Platform Admin", admin: "Super Admin", vertical_lead: "Vertical Lead", dept_lead: "Dept Lead", core: "Core", student: "Student" };

function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function DashHeader({ user, tabLabel, onOpenMobile, searchQuery, onSearch, onPickResult }) {
  const { theme, toggle, mounted } = useTheme();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const searchRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    let live = true;
    fetch("/api/notifications").then((r) => r.json()).then((d) => {
      if (live && d?.ok) setUnread(d.data?.unread ?? 0);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  // Ctrl/Cmd + K focuses search; Escape closes menus.
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setMenuOpen(false);
        searchRef.current?.blur();
      }
    }
    function onClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const results = q
    ? SAAS_NAV_INDEX.filter((n) => n.label.toLowerCase().includes(q)).slice(0, 6)
    : [];

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-3 sm:px-5" style={{ background: "var(--bg)", borderColor: "var(--line)" }}>
      <button
        type="button"
        onClick={onOpenMobile}
        aria-label="Open navigation menu"
        title="Navigation menu — all dashboard sections"
        className="rounded-lg p-2 transition hover:bg-[var(--bg-muted)]"
        style={{ color: "var(--text-muted)" }}
      >
        <Menu size={17} />
      </button>

      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-[12.5px] sm:flex">
        <Link href="/admin" prefetch={false} className="shrink-0 transition hover:underline" style={{ color: "var(--text-muted)" }}>
          Home
        </Link>
        <ChevronRight size={12} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <Link href="/admin/analytics" prefetch={false} className="shrink-0 transition hover:underline" style={{ color: "var(--text-muted)" }}>
          Analytics
        </Link>
        <ChevronRight size={12} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <span className="truncate font-medium" style={{ color: "var(--text)" }} aria-current="page">{tabLabel}</span>
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        <div className="relative">
          <div
            className={`flex w-40 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition sm:w-52 ${focused ? "ring-2" : ""}`}
            style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", ...(focused ? { "--tw-ring-color": "var(--dash-accent-soft)", boxShadow: "0 0 0 3px var(--dash-accent-soft)" } : {}) }}
          >
            <Search size={14} className="shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 120)}
              placeholder="Search here"
              aria-label="Search dashboard"
              className="w-full bg-transparent text-[13px] outline-none"
              style={{ color: "var(--text)" }}
            />
            <kbd className="hidden shrink-0 rounded border px-1 font-mono text-[10px] sm:block" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
              ⌘K
            </kbd>
          </div>
          {focused && q && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-xl border shadow-lg" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} role="listbox" aria-label="Search results">
              {results.length === 0 ? (
                <p className="px-3 py-2.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>No matches for “{searchQuery}”.</p>
              ) : results.map((r) => (
                <button
                  key={r.href + r.label}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickResult(r)}
                  className="block w-full px-3 py-2 text-left text-[12.5px] transition hover:bg-[var(--bg-muted)]"
                  style={{ color: "var(--text)" }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggle}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title="Appearance"
          className="rounded-full p-2 transition hover:bg-[var(--bg-muted)] active:scale-95"
          style={{ color: "var(--text-muted)" }}
        >
          {mounted && theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <Link
          href="/student/notifications"
          prefetch={false}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          title="Notifications"
          className="relative rounded-full p-2 transition hover:bg-[var(--bg-muted)] active:scale-95"
          style={{ color: "var(--text-muted)" }}
        >
          <Bell size={16} />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid size-3.5 place-items-center rounded-full text-[8.5px] font-bold text-white" style={{ background: "var(--dash-accent)" }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition hover:bg-[var(--bg-muted)]"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: "var(--dash-accent)" }} aria-hidden="true">
              {initials(user?.name)}
            </span>
            <span className="hidden text-left leading-tight md:block">
              <span className="block max-w-24 truncate text-[12.5px] font-semibold" style={{ color: "var(--text)" }}>{user?.name || "Admin"}</span>
              <span className="block text-[10.5px]" style={{ color: "var(--text-muted)" }}>{ROLE_LABEL[user?.role] || "Admin"}</span>
            </span>
            <ChevronDown size={13} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-full z-50 mt-1.5 w-48 overflow-hidden rounded-xl border py-1 shadow-lg" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <Link href="/student/settings" prefetch={false} role="menuitem" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-[12.5px] transition hover:bg-[var(--bg-muted)]" style={{ color: "var(--text)" }}>
                <UserRound size={14} /> Profile
              </Link>
              <Link href="/admin/settings" prefetch={false} role="menuitem" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-[12.5px] transition hover:bg-[var(--bg-muted)]" style={{ color: "var(--text)" }}>
                <Settings size={14} /> Account Settings
              </Link>
              <form action="/auth/signout" method="post">
                <button type="submit" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition hover:bg-[var(--bg-muted)]" style={{ color: "var(--danger)" }}>
                  <LogOut size={14} /> Logout
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
