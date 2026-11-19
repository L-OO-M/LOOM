"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Moon, Sun, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { useTheme } from "@/lib/theme";
import { useWorkspaceLink } from "@/lib/use-workspace-link";
import { publicNav, workspaceForPath } from "@/lib/nav";
import "./public-nav.css";

export function PublicNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const button = useRef(null);
  const sheet = useRef(null);
  const pathname = usePathname();
  const workspace = useWorkspaceLink();
  const currentWorkspace = workspaceForPath(pathname);
  const dashboard = currentWorkspace ? `/${currentWorkspace}` : workspace;
  const { theme, toggle, mounted } = useTheme();
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    // The sheet covers the page, so the page behind it must not scroll.
    document.body.style.overflow = "hidden";
    const panel = sheet.current;
    const focusables = () =>
      Array.from(panel?.querySelectorAll("a[href], button:not([disabled])") ?? []);
    // Focus moves into the sheet; without this, screen readers and Tab stayed
    // on the trigger while the links were visually open.
    focusables()[0]?.focus();
    function close(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        button.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);
  const links = publicNav.map(([label, href]) => (
    <Link
      key={href}
      href={href}
      prefetch={false}
      aria-current={
        href === pathname ||
        (href !== "/" &&
          !href.includes("#") &&
          pathname?.startsWith(`${href}/`))
          ? "page"
          : undefined
      }
      onClick={() => setMenuOpen(false)}
    >
      {label}
    </Link>
  ));
  return (
    <header className="site-nav" data-site-nav>
      <div className="site-nav-inner">
        <BrandMark size={30} />
        <nav className="site-nav-links" aria-label="Primary">
          {links}
        </nav>
        <div className="site-nav-actions">
          <button
            type="button"
            onClick={toggle}
            className="site-nav-icon"
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {mounted && theme === "dark" ? (
              <Sun size={18} />
            ) : (
              <Moon size={18} />
            )}
          </button>
          <Link
            href={dashboard || "/login"}
            prefetch={false}
            className="site-nav-signin"
          >
            {dashboard ? "Dashboard" : "Sign in"}
          </Link>
          <Link
            href={dashboard || "/register"}
            prefetch={false}
            className="site-nav-cta"
          >
            {dashboard ? "Open workspace" : "Get started"}
          </Link>
          <button
            ref={button}
            type="button"
            className="site-nav-icon site-nav-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="site-mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <div
          ref={sheet}
          id="site-mobile-nav"
          className="site-nav-mobile"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <nav aria-label="Mobile">{links}</nav>
          <div className="site-nav-mobile-actions">
            <Link
              href={dashboard || "/login"}
              prefetch={false}
              onClick={() => setMenuOpen(false)}
            >
              {dashboard ? "Dashboard" : "Sign in"}
            </Link>
            <Link
              href={dashboard || "/register"}
              prefetch={false}
              className="site-nav-cta"
              onClick={() => setMenuOpen(false)}
            >
              {dashboard ? "Open workspace" : "Get started"}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
