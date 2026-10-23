"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Moon, Sun, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { useTheme } from "@/lib/theme";
import { useWorkspaceLink } from "@/lib/use-workspace-link";
import { publicNav } from "@/lib/nav";
import "./public-nav.css";

export function PublicNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const button = useRef(null);
  const pathname = usePathname();
  const workspace = useWorkspaceLink();
  const currentWorkspace = ["student", "lead", "admin"].find(
    (area) => pathname === `/${area}` || pathname?.startsWith(`/${area}/`),
  );
  const dashboard = currentWorkspace ? `/${currentWorkspace}` : workspace;
  const { theme, toggle, mounted } = useTheme();
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    function close(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
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
        <nav
          id="site-mobile-nav"
          className="site-nav-mobile"
          aria-label="Mobile"
        >
          {links}
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
        </nav>
      )}
    </header>
  );
}
