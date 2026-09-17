"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// First-party page-view beacon. Fires at most once per path per 30
// minutes (sessionStorage guard) with an anonymous visitor id stored in
// localStorage (falls back to random). Never throws, never blocks render,
// silent on failure — tracking must never break the page.
function getVisitorId() {
  try {
    let vid = localStorage.getItem("loom-vid");
    if (!vid) {
      vid = typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : `v-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
      localStorage.setItem("loom-vid", vid);
    }
    return vid;
  } catch {
    return null;
  }
}

export function PageViewBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      if (!pathname || pathname.startsWith("/api/") || pathname.startsWith("/_next")) return;
      const now = Date.now();
      const last = Number(sessionStorage.getItem(`pv:${pathname}`) || 0);
      if (last && now - last < 30 * 60 * 1000) return;
      const visitorKey = getVisitorId();
      if (!visitorKey) return;
      sessionStorage.setItem(`pv:${pathname}`, String(now));
      fetch("/api/analytics/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          path: pathname.slice(0, 200),
          visitorKey,
          referrer: (document.referrer || "").slice(0, 300) || undefined,
        }),
      }).catch(() => {});
    } catch {
      /* tracking never breaks the page */
    }
  }, [pathname]);
  return null;
}
