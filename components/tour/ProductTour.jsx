"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Spotlight product tour.
 *
 * In-house rather than a dependency: the shell is role-aware, the state belongs
 * on the profile, and the styles must read the theme variables. The spotlight is
 * one rounded box with a 9999px box-shadow -- no SVG mask, no coordinate
 * library -- and the tooltip is nudged to the first side that fits the viewport.
 *
 * Two modes share it. The workspace walkthrough covers the nav, so it locks the
 * page (`lockScroll`). The page walkthrough points at content that is often
 * below the fold, so it must be allowed to scroll: it centres the target, then
 * follows it while the page settles instead of measuring once and drifting.
 *
 * Accessibility: it is a modal dialog with a focus trap, Escape skips, arrow
 * keys move, the step counter is announced, and reduced motion only removes the
 * smooth scroll.
 */

const GAP = 14;
const MARGIN = 12;
const HOLE_PAD = 6;
const CARD_WIDTH = 340;
const MIN_HOLE = 32;
/** How long to keep following a target while a smooth scroll and layout settle. */
const TRACK_MS = 1400;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** The first matching element that actually occupies space (desktop vs mobile). */
function visibleTarget(target) {
  if (typeof document === "undefined") return null;
  if (typeof target === "function") {
    const node = target();
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? node : null;
  }
  for (const node of document.querySelectorAll(target)) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return node;
  }
  return null;
}

/** A small target still needs a usable hole; a huge one is clipped to the viewport. */
function holeRect(rect) {
  const width = Math.min(Math.max(rect.width, MIN_HOLE), window.innerWidth - MARGIN * 2);
  const height = Math.min(Math.max(rect.height, MIN_HOLE), window.innerHeight - MARGIN * 2);
  const left = clamp(rect.left + (rect.width - width) / 2, MARGIN, window.innerWidth - width - MARGIN);
  const top = clamp(rect.top + (rect.height - height) / 2, MARGIN, window.innerHeight - height - MARGIN);
  return { left, top, width, height, right: left + width, bottom: top + height };
}


function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function positionFor(rect, cardWidth, cardHeight, placement) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_WIDTH, vw - MARGIN * 2);
  if (!rect) {
    return { left: clamp((vw - width) / 2, MARGIN, vw - width - MARGIN), top: clamp((vh - cardHeight) / 2, MARGIN, vh - cardHeight - MARGIN) };
  }
  const midX = rect.left + rect.width / 2 - width / 2;
  const midY = rect.top + rect.height / 2 - cardHeight / 2;
  const spots = {
    bottom: { left: midX, top: rect.bottom + GAP },
    top: { left: midX, top: rect.top - cardHeight - GAP },
    right: { left: rect.right + GAP, top: midY },
    left: { left: rect.left - width - GAP, top: midY }
  };
  const order = [placement, "bottom", "top", "right", "left"].filter(
    (value, index, list) => value && spots[value] && list.indexOf(value) === index
  );
  for (const side of order) {
    const spot = spots[side];
    if (spot.left >= MARGIN && spot.top >= MARGIN && spot.left + width <= vw - MARGIN && spot.top + cardHeight <= vh - MARGIN) {
      return { left: spot.left, top: spot.top };
    }
  }
  return {
    left: clamp(midX, MARGIN, vw - width - MARGIN),
    top: clamp(spots.bottom.top, MARGIN, vh - cardHeight - MARGIN)
  };
}

export function ProductTour({ steps, onStep, onClose, lockScroll = true }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState(null);
  const cardRef = useRef(null);
  const restoreRef = useRef(null);
  const stepCallback = useRef(onStep);
  stepCallback.current = onStep;
  const step = steps[index];
  const last = index === steps.length - 1;

  const close = useCallback(
    (reason) => {
      onClose?.(reason);
    },
    [onClose]
  );

  const go = useCallback(
    (direction) => {
      setIndex((current) => clamp(current + direction, 0, steps.length - 1));
    },
    [steps.length]
  );

  // Remember where focus came from, and only lock the page when the tour is
  // covering the nav. The page walkthrough has to scroll to reach its targets.
  useEffect(() => {
    restoreRef.current = document.activeElement;
    if (!lockScroll) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [lockScroll]);

  useEffect(
    () => () => {
      if (restoreRef.current?.focus) restoreRef.current.focus();
    },
    []
  );

  // Centre the target, then follow it while a smooth scroll and layout settle.
  // A single measurement is what left the hole behind after the page moved.
  useEffect(() => {
    if (!step) return;
    setRect(null);
    const reduced = prefersReducedMotion();
    const node = visibleTarget(step.target);
    node?.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });

    let frame = 0;
    let last = "";
    const deadline = performance.now() + (reduced ? 400 : TRACK_MS);

    function measure() {
      const current = visibleTarget(step.target);
      const raw = current ? current.getBoundingClientRect() : null;
      const next = raw ? holeRect(raw) : null;
      const key = next ? `${Math.round(next.left)},${Math.round(next.top)},${Math.round(next.width)},${Math.round(next.height)}` : "none";
      if (key !== last) {
        last = key;
        setRect(next);
      }
      if (performance.now() < deadline) frame = requestAnimationFrame(measure);
    }

    frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  // Card size is only known after render, so the final position is measured.
  // While a step is being re-measured the card is hidden rather than left at the
  // previous target's position.
  useEffect(() => {
    if (!cardRef.current) return;
    if (!rect) {
      setPos(null);
      return;
    }
    const box = cardRef.current.getBoundingClientRect();
    setPos(positionFor(rect, box.width, box.height, step?.placement));
    cardRef.current.focus({ preventScroll: true });
  }, [rect, step]);

  useEffect(() => {
    if (step) stepCallback.current?.(index, step);
  }, [index, step]);

  if (!step) return null;

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close("skip");
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (last) close("complete");
      else go(1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (index > 0) go(-1);
      return;
    }
    if (event.key !== "Tab" || !cardRef.current) return;
    // Focus trap: the page behind is inert, so Tab must cycle the card only.
    const focusable = Array.from(
      cardRef.current.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")
    ).filter((node) => !node.disabled);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const end = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      end.focus();
    } else if (!event.shiftKey && document.activeElement === end) {
      event.preventDefault();
      first.focus();
    }
  }

  const titleId = `tour-title-${step.id}`;
  const width = CARD_WIDTH;

  return (
    <div
      className="fixed inset-0 z-[130]"
      data-tour-ui="true"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute inset-0"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
      {rect ? (
        <div
          aria-hidden="true"
          data-tour-hole="true"
          className="pointer-events-none absolute rounded-2xl"
          style={{
            left: rect.left - HOLE_PAD,
            top: rect.top - HOLE_PAD,
            width: rect.width + HOLE_PAD * 2,
            height: rect.height + HOLE_PAD * 2,
            border: "2px solid var(--accent)",
            boxShadow: "0 0 0 9999px rgba(6, 8, 12, 0.68)"
          }}
        />
      ) : (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "rgba(6, 8, 12, 0.68)" }} />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        data-tour-card="true"
        className="absolute rounded-2xl border p-4 shadow-2xl outline-none"
        style={{
          left: pos?.left ?? MARGIN,
          top: pos?.top ?? MARGIN,
          width,
          maxWidth: "calc(100vw - 24px)",
          borderColor: "var(--line)",
          background: "var(--bg-elevated)",
          color: "var(--text)",
          visibility: pos ? "visible" : "hidden"
        }}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }} aria-live="polite">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id={titleId} className="mt-1.5 text-base font-semibold">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{step.body}</p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="text-xs font-semibold hover:underline" style={{ color: "var(--text-muted)" }} onClick={() => close("skip")}>
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
              onClick={() => go(-1)}
              disabled={index === 0}
            >
              Back
            </button>
            <button
              type="button"
              className="btn-ink !px-3.5 !py-1.5 text-xs"
              onClick={() => (last ? close("complete") : go(1))}
            >
              {last ? "Finish" : "Next"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex gap-1" aria-hidden="true">
          {steps.map((entry, dot) => (
            <span
              key={entry.id}
              className="h-1 flex-1 rounded-full"
              style={{ background: dot <= index ? "var(--accent)" : "var(--line)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
