"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProductTour } from "./ProductTour";
import { track } from "@/lib/track-client";

/**
 * The per-page walkthrough.
 *
 * Runs once per page per member over the page's own sections: the header, then
 * each region named in `lib/page-guides.js`, in the order it appears. Steps whose
 * text is not on the page are dropped, so a feature-off screen, an empty state
 * or a mobile-only control cannot produce a tour pointing at nothing.
 *
 * Nothing is mounted permanently: there is no panel at the top of the page, and
 * the walkthrough closes for good on Skip or Finish. Settings can replay it.
 */

const NORMALIZE = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();

/** Attempts cover a page whose sections arrive with a slow server fetch. */
const ATTEMPT_DELAYS_MS = [900, 1800, 3200];

function mainRoot() {
  return document.getElementById("main") || document.body;
}

/** A heading, button or link whose visible text matches, preferring a painted one. */
function findByText(text) {
  const needle = NORMALIZE(text);
  if (!needle) return null;
  const root = mainRoot();
  let fallback = null;

  for (const node of root.querySelectorAll("h1, h2, h3, h4, h5, summary, legend, dt, button, a, label, th, strong")) {
    if (NORMALIZE(node.textContent) !== needle) continue;
    if (node.getBoundingClientRect().width > 0) return node;
    fallback = fallback || node;
  }
  if (fallback) return fallback;

  // Last resort for a section title rendered as plain text in a small element.
  for (const node of root.querySelectorAll("p, span, div, li")) {
    if (node.children.length > 2) continue;
    if (NORMALIZE(node.textContent) !== needle) continue;
    if (node.getBoundingClientRect().width > 0) return node;
  }
  return null;
}

/**
 * The block to spotlight. A heading usually sits inside the section it titles,
 * so the nearest section-ish ancestor is the right thing to outline; when that
 * ancestor is nearly the whole page, keep the heading itself.
 */
function sectionOf(node) {
  if (!node) return null;
  const box = node.closest("section, article, li, form, table, header, details, aside") || node.parentElement || node;
  const rect = box.getBoundingClientRect();
  if (rect.width === 0 || rect.height > window.innerHeight * 0.9) return node;
  return box;
}

function buildSteps(guide) {
  const steps = [];
  const header = document.querySelector("#main h1");
  if (header) {
    steps.push({
      id: "page",
      target: () => sectionOf(document.querySelector("#main h1")),
      title: guide.title,
      body: guide.body,
      placement: "bottom"
    });
  }
  guide.sections.forEach((section, index) => {
    if (!findByText(section.at)) return;
    steps.push({
      id: `${guide.id}-${index}`,
      target: () => sectionOf(findByText(section.at)),
      title: section.at,
      body: section.say,
      placement: "bottom"
    });
  });
  return steps;
}

export function PageTour({ guide, enabled, onSeen, onStep }) {
  const [steps, setSteps] = useState(null);
  const [running, setRunning] = useState(false);
  const timers = useRef([]);

  // Resolve after paint: server data, client fetches and responsive layouts all
  // change what is on the page in the first seconds.
  useEffect(() => {
    if (!enabled || !guide) return;
    let cancelled = false;
    timers.current.forEach(clearTimeout);
    timers.current = ATTEMPT_DELAYS_MS.map((delay) =>
      setTimeout(() => {
        if (cancelled) return;
        const resolved = buildSteps(guide);
        if (resolved.length >= 2) {
          setSteps(resolved);
          setRunning(true);
          timers.current.forEach(clearTimeout);
        }
      }, delay)
    );
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
    };
  }, [enabled, guide]);

  // A workspace walkthrough takes over the screen; this one steps aside rather
  // than stacking a second modal on top of it.
  useEffect(() => {
    if (!enabled) setRunning(false);
  }, [enabled]);

  const close = useCallback(
    (reason) => {
      setRunning(false);
      onSeen?.(guide, reason);
    },
    [guide, onSeen]
  );

  const step = useCallback(
    (index, current) => {
      onStep?.(guide, index, current);
      track("tour_step", {
        path: window.location.pathname,
        target: current.id,
        metadata: { tour: guide.id, version: guide.version, step: index + 1, step_id: current.id }
      });
    },
    [guide, onStep]
  );

  const tour = useMemo(() => (steps && steps.length >= 2 ? steps : null), [steps]);

  if (!running || !tour) return null;
  return <ProductTour steps={tour} onStep={step} onClose={close} />;
}
