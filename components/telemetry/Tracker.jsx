"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/track-client";

/**
 * One page view per route change, for every signed-in and public page.
 *
 * Mounted once in the root layout. The path is the route, not the full URL: the
 * server strips ids anyway, and no query string leaves the browser. A ref keeps
 * React's development double-effect from counting the same view twice.
 */
export function Tracker() {
  const pathname = usePathname();
  const last = useRef({ path: "", at: 0 });

  useEffect(() => {
    if (!pathname) return;
    const now = Date.now();
    if (last.current.path === pathname && now - last.current.at < 1000) return;
    last.current = { path: pathname, at: now };
    track("page_view", { path: pathname });
  }, [pathname]);

  return null;
}
