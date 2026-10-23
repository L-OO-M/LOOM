"use client";
import { Children, useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);
export function FlowSection({
  className = "",
  style,
  children,
  "aria-label": ariaLabel,
}) {
  return (
    <section
      data-flow-section
      aria-label={ariaLabel}
      className={`flow-section ${className}`.trim()}
    >
      <div data-flow-inner className="flow-art-container" style={style}>
        {children}
      </div>
    </section>
  );
}
export default function FlowArt({
  children,
  className = "",
  "aria-label": ariaLabel = "L.O.O.M. story",
}) {
  const containerRef = useRef(null);
  const childCount = Children.count(children);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Revert pins and transforms immediately when motion preferences change.
    const media = gsap.matchMedia();
    media.add(
      "(prefers-reduced-motion: no-preference) and (min-width: 768px)",
      () => {
      const sections = Array.from(
        container.querySelectorAll("[data-flow-section]"),
      );
      if (sections.length < 2) return;
      sections.forEach((section, index) => {
        gsap.set(section, { zIndex: index + 1 });
        const inner = section.querySelector("[data-flow-inner]");
        if (!inner) return;
        if (index > 0) {
          gsap.fromTo(
            inner,
            { rotation: 30, transformOrigin: "bottom left" },
            {
              rotation: 0,
              ease: "none",
              scrollTrigger: {
                trigger: section,
                start: "top bottom",
                end: "top 25%",
                scrub: true,
                invalidateOnRefresh: true,
              },
            },
          );
        }
        if (index < sections.length - 1) {
          ScrollTrigger.create({
            trigger: section,
            start: "bottom bottom",
            end: "bottom top",
            pin: true,
            pinSpacing: false,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          });
        }
      });
      // Fonts and responsive content can change section heights after mount.
      let disposed = false;
      let refreshFrame = 0;
      const scheduleRefresh = () => {
        cancelAnimationFrame(refreshFrame);
        refreshFrame = requestAnimationFrame(() => {
          if (!disposed) ScrollTrigger.refresh();
        });
      };
      const observer = new ResizeObserver(scheduleRefresh);
      sections.forEach((section) => {
        const inner = section.querySelector("[data-flow-inner]");
        if (inner) observer.observe(inner);
      });
      void document.fonts.ready.then(() => {
        if (!disposed) scheduleRefresh();
      });
      scheduleRefresh();
      return () => {
        disposed = true;
        cancelAnimationFrame(refreshFrame);
        observer.disconnect();
      };
    });
    return () => media.revert();
  }, [childCount]);
  return (
    <div
      ref={containerRef}
      aria-label={ariaLabel}
      className={`loom-about flow-art ${className}`.trim()}
    >
      {children}
    </div>
  );
}
