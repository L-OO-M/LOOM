"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { createClient } from "@/lib/supabase/client";
import { homeForRole } from "@/lib/auth";

const links = [["About", "/about"], ["Domains", "/domains"], ["Events", "/events"], ["FAQ", "/faq"], ["Community", "#community"]];

export function ThemeToggle() {
  const { theme, toggle, mounted } = useTheme();
  return <button type="button" className="story-icon" onClick={toggle} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>{mounted && theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>;
}

export function useWorkspaceLink() {
  const [workspace, setWorkspace] = useState(null);
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    let live = true;
    let revision = 0;
    const controller = new AbortController();
    const supabase = createClient();
    async function update(user) {
      const current = ++revision;
      if (!user) { if (live) setWorkspace(null); return; }
      try {
        const response = await fetch("/api/profile", { signal: controller.signal });
        const body = await response.json();
        if (live && current === revision && response.ok && body.ok) setWorkspace(homeForRole(body.data?.profile?.role));
      } catch { /* Auth links remain available when the profile cannot load. */ }
    }
    supabase.auth.getUser().then(({ data }) => update(data.user)).catch(() => {});
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Keep profile work outside the auth callback's session lock.
      queueMicrotask(() => { if (live) void update(session?.user); });
    });
    return () => { live = false; controller.abort(); data.subscription.unsubscribe(); };
  }, []);
  return workspace;
}

export function HomeNavigation({ workspace }) {
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  useEffect(() => {
    if (!open) return;
    function close(event) {
      if (event.key === "Escape") { setOpen(false); button.current?.focus(); }
    }
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  const items = links.map(([label, href]) => <Link key={label} href={href} prefetch={false} onClick={() => setOpen(false)}>{label}</Link>);
  return <header className="story-nav">
    <Link href="/" prefetch={false} className="story-brand" aria-label="L.O.O.M. home">L.O.O.M.</Link>
    <nav className="story-nav-links" aria-label="Primary">{items}</nav>
    <div className="story-nav-actions">
      <ThemeToggle />
      <Link href={workspace || "/login"} prefetch={false} className="story-signin">{workspace ? "Dashboard" : "Sign in"}</Link>
      <button ref={button} type="button" className="story-icon story-menu-button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="story-mobile-nav" onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button>
    </div>
    {open && <nav id="story-mobile-nav" className="story-mobile-nav" aria-label="Mobile">{items}<Link href="/register" prefetch={false} onClick={() => setOpen(false)}>Join the Community</Link></nav>}
  </header>;
}
