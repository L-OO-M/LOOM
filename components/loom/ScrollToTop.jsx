"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/* Land every client-side navigation at the top of the new page.

   Next's own scroll handling is not enough here: `html` carries
   `scroll-behavior: smooth` (app/globals.css) so the router's programmatic
   `window.scrollTo(0, 0)` turns into an animation that starts from the old
   offset and can be interrupted by the incoming page's layout. The result is
   what a reader sees as "the next page opened where the last one left off".

   Two details matter:
   - A layout effect, not an effect: it runs before the browser paints the new
     route, so there is no frame showing the page scrolled down.
   - Back/forward is left alone. The browser (and Next) restore the previous
     position on history navigation, which is the expected behaviour; this only
     resets on a new navigation. A click clears the flag, so a same-URL history
     step cannot leave it stuck on for the next link.
*/

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function ScrollToTop() {
  const pathname = usePathname();
  const historyNavigation = useRef(false);
  const firstRender = useRef(true);

  useEffect(() => {
    const markHistory = () => {
      historyNavigation.current = true;
    };
    const clearOnClick = () => {
      historyNavigation.current = false;
    };
    window.addEventListener("popstate", markHistory);
    document.addEventListener("click", clearOnClick, true);
    return () => {
      window.removeEventListener("popstate", markHistory);
      document.removeEventListener("click", clearOnClick, true);
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    // The first render is a page load, not a navigation. Browsers may be
    // restoring a deep-link or reload position; don't fight that.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    if (historyNavigation.current) {
      historyNavigation.current = false;
      return;
    }

    // `scroll-behavior: smooth` also applies to programmatic scrolls. Turn it
    // off for this single write so the reset is instant, then restore it for
    // in-page anchors.
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previous;
  }, [pathname]);

  return null;
}
