"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Moon, Sun, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { useTheme } from "@/lib/theme";

const LINKS = [
  ["About", "/about"],
  ["Events", "/events"],
  ["FAQ", "/faq"],
  ["Domains", "/domains/web"]
];

/* Slim sibling of the landing header: same floatbar language, route links
   into the public pages, theme toggle, and auth actions. */
export function PublicNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggle, mounted } = useTheme();
  return (
    <header className="fixed top-0 z-50 h-16 w-full border-b backdrop-blur-md" style={{ borderColor: "var(--line)", background: "var(--nav-bg)" }}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
        <Link href="/" prefetch={false} aria-label="L.O.O.M. home">
          <BrandMark size={30} />
        </Link>
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {LINKS.map(([label, href]) => (
            <Link key={label} href={href} prefetch={false} className="link-slide text-sm font-medium transition hover:opacity-100" style={{ color: "var(--text-muted)" }}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <button
            onClick={toggle}
            className="rounded-full p-2 transition hover:opacity-80 active:scale-95"
            style={{ color: "var(--text-muted)" }}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {mounted && theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link href="/login" prefetch={false} className="rounded-[10px] px-4 py-2 text-sm font-semibold transition hover:opacity-80" style={{ color: "var(--text)" }}>
            Sign in
          </Link>
          <Link href="/register" prefetch={false} className="btn-ink !py-2">Get started</Link>
        </div>
        <div className="flex items-center gap-1 lg:hidden">
          <button onClick={toggle} className="rounded-lg p-2" style={{ color: "var(--text)" }} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {mounted && theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            className="rounded-lg p-2"
            style={{ color: "var(--text)" }}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav className="border-t px-5 py-4 lg:hidden" style={{ borderColor: "var(--line)", background: "var(--nav-bg)" }} aria-label="Mobile">
          <div className="flex flex-col">
            <Link href="/" prefetch={false} onClick={() => setMenuOpen(false)} className="py-3 text-sm font-medium" style={{ color: "var(--text)" }}>
              Home
            </Link>
            {LINKS.map(([label, href]) => (
              <Link key={label} href={href} prefetch={false} onClick={() => setMenuOpen(false)} className="py-3 text-sm font-medium" style={{ color: "var(--text)" }}>
                {label}
              </Link>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Link href="/login" prefetch={false} className="btn-ghost justify-center">Sign in</Link>
            <Link href="/register" prefetch={false} className="btn-ink justify-center">Get started</Link>
          </div>
        </nav>
      )}
    </header>
  );
}
