"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/* Navigation feedback.
   Workspace pages render their own AppShell, so a segment `loading.jsx` used to
   replace the whole page — nav, account chip and notifications vanished for the
   seconds a slow query took. Those boundaries are gone (the previous page now
   stays on screen), so this bar is what tells you a click was heard: 2px at the
   top of the viewport, accent coloured, no layout shift, no focus change. */

export function RouteProgress() {
  const pathname = usePathname();
  const [state, setState] = useState({ visible: false, value: 0 });
  const timer = useRef(null);
  const started = useRef(false);
  const first = useRef(true);

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const begin = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setState({ visible: true, value: 10 });
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    stop();
    // Approach 90% and wait: the last 10% only lands when the route is ready.
    timer.current = setInterval(() => {
      setState((s) => (s.value >= 90 ? s : { visible: true, value: Math.min(90, s.value + Math.max(1, (90 - s.value) / 8)) }));
    }, 180);
  }, [stop]);

  // A completed navigation is the only signal that the new route is on screen.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    stop();
    started.current = false;
    setState({ visible: true, value: 100 });
    const hide = setTimeout(() => setState({ visible: false, value: 0 }), 240);
    return () => clearTimeout(hide);
  }, [pathname, stop]);

  useEffect(() => {
    function onClick(event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (anchor.getAttribute("aria-disabled") === "true") return;
      const next = new URL(anchor.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      // Jump links and same-URL clicks are not navigations.
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;
      begin();
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", begin);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", begin);
      stop();
    };
  }, [begin, stop]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        zIndex: 9999,
        pointerEvents: "none",
        background: "var(--accent)",
        opacity: state.visible ? 1 : 0,
        transition: "opacity 160ms linear",
        transform: `scaleX(${Math.max(0, Math.min(100, state.value)) / 100})`,
        transformOrigin: "0 50%"
      }}
    />
  );
}
