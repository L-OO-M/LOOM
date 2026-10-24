"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { X, Maximize2, Minimize2, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { ZEN_EMBED_LOAD_TIMEOUT_MS, zenHostOf, zenLearningSummary, zenResourceFacts, zenSiteFallback, zenUnsupportedFallback, isFrameCspViolation } from "@/lib/zen-embed";
import { ZEN_OUTCOME, zenStageInit, zenStageNext, zenStageOutcome, zenStageView } from "@/lib/zen-stage";

/* Zen Learning Mode — distraction-free overlay for supported resources.
   Dark canvas by spec (works identically in both themes). One concern:
   show the thing, offer fullscreen + external open, never trap the user.
   Cross-origin iframe blocks often fire no error at all, so the fallback
   below is timeout-based and worded as a possibility — not a diagnosis.

   GATED OFF BY DEFAULT. `zenEnabled` comes from the per-chapter zen_mode
   feature flag (lib/feature-flags.js), read on the server and passed down as a
   prop so the server HTML and the hydrated tree can never disagree. The prop
   defaults to false, so mounting this component directly — bypassing the
   click path entirely — still renders nothing. The guard sits after every
   hook, so hook order is identical in both states. */

/* Every classification has exactly one stage. "unsupported" is the branch that
   used to render nothing (the blank-stage defect): an overlay chrome around an
   empty rectangle. It now gets the same informed hand-off the blocked-site
   panel gives, so no classification can produce an empty stage. */

const STATUS_LABEL = {
  youtube: "Video",
  site: "Guide",
  pdf: "PDF",
  external: "External",
  unsupported: "Link",
};

function iframeAllow(status) {
  if (status === "youtube") {
    return "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  }
  return "fullscreen";
}

/* Shared context block for every panel that cannot show the material itself.
   Without it those panels are a few grey lines on a black rectangle and read
   as a broken screen. Everything here is a stored fact about the resource or
   its roadmap node — never generated copy. */
function ZenContext({ summary, facts }) {
  if (!summary && facts.length === 0) return null;
  return (
    <>
      {summary ? (
        <div className="zen-context">
          <p className="zen-context-label">{summary.source || "What you’ll learn here"}</p>
          <p className="zen-context-text">{summary.text}</p>
        </div>
      ) : null}
      {facts.length > 0 ? (
        <ul className="zen-facts">
          {facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function ZenMode({ resource, embed, node, onClose, onNext, onPrev, position, zenEnabled = false }) {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef(null);
  const closeRef = useRef(null);
  const restoredRef = useRef(null);
  // Iframe/fallback stage machine (lib/zen-stage.js): a load event — which
  // browsers also fire for their own refusal pages — can never dismiss the
  // fallback, and a late timer can never undo the user's manual choice.
  const [stage, dispatchStage] = useReducer(zenStageNext, undefined, zenStageInit);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsNote, setFsNote] = useState("");

  const title = resource?.title || "Resource";
  const originUrl = embed?.originUrl || null;
  const embedUrl = embed?.embedUrl || null;
  const status = embed?.status || "unsupported";
  // Rendered visibility comes from the stage machine: the fallback panel
  // stays mounted (and the iframe stays hidden) even after a late load
  // event, so a refusal page can never cover the fallback controls.
  const view = zenStageView(stage, status);
  const outcome = zenStageOutcome(status);
  const siteFallback = view.showSitePanel ? zenSiteFallback() : null;
  // Zen can host neither this resource nor its site. The panel still has to say
  // something useful: what the learner was about to study, and how to reach it.
  const unsupportedPanel = outcome === ZEN_OUTCOME.UNSUPPORTED ? zenUnsupportedFallback(Boolean(originUrl)) : null;
  // A fallback panel that can only say "open it elsewhere" reads as a broken
  // screen. These are the real, stored facts about what the learner was about
  // to study — never invented copy.
  const summary = zenLearningSummary(resource, node);
  const facts = zenResourceFacts(resource);
  // Show where the material actually lives (never a raw/unsafe string).
  const host = zenHostOf(originUrl);
  // Identity of the selected resource. The overlay stays mounted while the
  // selection changes, so loading/error state and the iframe itself must
  // reset on this — not just on embedUrl, which two resources can share.
  const resourceKey = resource?.id ?? title;

  // Scroll lock + focus: autofocus close, restore focus on unmount.
  useEffect(() => {
    restoredRef.current = document.activeElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      const el = restoredRef.current;
      if (el && typeof el.focus === "function") {
        try {
          el.focus({ preventScroll: true });
        } catch {
          // Focus restore is best-effort.
        }
      }
    };
  }, []);

  // Keyboard isolation: while Zen is open, neither Escape nor the arrow
  // keys may reach the underlying NodeDrawer (Escape closes its panel,
  // arrows walk its node selection). The capture listener is removed on
  // unmount, so normal drawer keys work again the moment Zen closes.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.stopPropagation();
        return;
      }
      if (e.key === "Escape") {
        e.stopPropagation();
        // Fullscreen first: the browser consumes this Escape to leave
        // fullscreen (when it delivers the key at all). Closing Zen
        // underneath it would collapse both layers in one press.
        if (document.fullscreenElement) return;
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Reset + load timer. The reducer ignores a late timeout unless the
  // frame is still loading, so this can never reset a manual fallback
  // choice, a retry, or a newer selection. frameKey in deps re-arms the
  // timer after every retry. PDFs render no iframe, so nothing is waited for.
  useEffect(() => {
    if (status === "pdf" || !embedUrl) return;
    dispatchStage({ type: "reset", key: resourceKey });
    const t = setTimeout(() => dispatchStage({ type: "timeout" }), ZEN_EMBED_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [embedUrl, resourceKey, status, stage.frameKey]);

  // CSP refusals. When our own frame-src blocks the embed the browser fires
  // securitypolicyviolation — and often a `load` for its error page too, so a
  // "ready" frame can be empty. This is the one block signal we own; the
  // reducer makes it idempotent and it never rewinds a retry. Scoped to the
  // current embed so a stale violation cannot fall back the next resource.
  useEffect(() => {
    if (status === "pdf" || !embedUrl) return;
    const onViolation = (e) => {
      if (isFrameCspViolation(e)) dispatchStage({ type: "violation" });
    };
    document.addEventListener("securitypolicyviolation", onViolation);
    return () => document.removeEventListener("securitypolicyviolation", onViolation);
  }, [embedUrl, status]);

  // Track browser fullscreen so the toggle icon stays honest when the
  // user exits via browser Esc or gesture (overlay itself stays open).
  useEffect(() => {
    const sync = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = useCallback(() => {
    setFsNote("");
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      const exit = document.exitFullscreen?.bind(document);
      if (!exit) {
        setFsNote("Fullscreen isn't available here — Zen Mode works inline.");
        return;
      }
      Promise.resolve(exit()).catch(() => {
        setFsNote("Couldn't leave fullscreen — press Esc.");
      });
      return;
    }
    const request = el.requestFullscreen?.bind(el);
    if (!request) {
      setFsNote("Fullscreen isn't available here — Zen Mode works inline.");
      return;
    }
    // Called inside the click handler (real user gesture). Denial is
    // fine — the overlay keeps working. Both sync throws (older
    // implementations) and async rejections land on the same note.
    let pending;
    try {
      pending = request();
    } catch {
      setFsNote("Fullscreen isn't available here — Zen Mode works inline.");
      return;
    }
    Promise.resolve(pending).catch(() => {
      setFsNote("Fullscreen was blocked — Zen Mode works inline.");
    });
  }, []);

  const onFrameLoad = useCallback(() => {
    dispatchStage({ type: "loaded" });
  }, []);

  const onFrameError = useCallback(() => {
    dispatchStage({ type: "error" });
  }, []);

  const showFallback = useCallback(() => {
    dispatchStage({ type: "show" });
  }, []);

  const retry = useCallback(() => {
    dispatchStage({ type: "retry" });
  }, []);

  const motionProps = reduceMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  // The gate itself. Placed after every hook so the hook sequence is byte
  // identical whether the flag is on or off — an early return before the hooks
  // would break React's rules when a chapter flips the flag mid-session.
  if (!zenEnabled) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="zen-backdrop"
        className="zen-backdrop"
        {...motionProps}
        transition={{ duration: 0.2 }}
        aria-hidden="true"
      />
      <motion.section
        key="zen-panel"
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Zen Learning Mode: ${title}`}
        className="zen-panel"
        initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
        transition={{ duration: 0.22 }}
      >
        <header className="zen-head">
          <div className="zen-title-wrap">
            <p className="zen-eyebrow">Zen Learning Mode{STATUS_LABEL[status] ? ` · ${STATUS_LABEL[status]}` : ""}</p>
            <p className="zen-title">{title}</p>
          </div>
          <div className="zen-actions">
            {onPrev ? (
              <button
                type="button"
                onClick={onPrev}
                className="zen-btn zen-icon-btn"
                aria-label="Previous resource"
                title="Previous resource"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
            ) : null}
            {onNext ? (
              <button
                type="button"
                onClick={onNext}
                className="zen-btn zen-icon-btn"
                aria-label="Next resource"
                title="Next resource"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ) : null}
            {originUrl ? (
              <a
                href={originUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="zen-btn"
                aria-label={`Open ${title} externally in a new tab`}
              >
                <ExternalLink size={15} aria-hidden="true" />
                <span className="zen-btn-label">Open externally</span>
              </a>
            ) : null}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="zen-btn zen-icon-btn"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              aria-pressed={isFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen (optional)"}
            >
              {isFullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              ref={closeRef}
              autoFocus
              className="zen-btn zen-icon-btn"
              aria-label="Close Zen Mode and return to the roadmap"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </header>
        {fsNote ? (
          <p className="zen-note" role="status">
            {fsNote}
          </p>
        ) : null}

        <div className="zen-stage">
          {outcome === ZEN_OUTCOME.UNSUPPORTED ? (
            <div className="zen-pdf" role="note" aria-label={`${title} cannot be previewed inline`}>
              <p className="zen-pdf-eyebrow">{unsupportedPanel.eyebrow}{host ? ` · ${host}` : ""}</p>
              <p className="zen-pdf-title">{unsupportedPanel.title}</p>
              <ZenContext summary={summary} facts={facts} />
              <p className="zen-pdf-body">{unsupportedPanel.body}</p>
              <div className="zen-pdf-actions">
                {originUrl ? (
                  <a
                    href={originUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="zen-btn zen-btn-light"
                    aria-label={`Open ${title} externally in a new tab`}
                  >
                    <ExternalLink size={14} aria-hidden="true" /> {unsupportedPanel.linkLabel}
                  </a>
                ) : null}
                <button type="button" onClick={onClose} className="zen-btn zen-btn-ghost">
                  Back to roadmap
                </button>
              </div>
            </div>
          ) : outcome === ZEN_OUTCOME.EXTERNAL ? (
            <div className="zen-pdf" role="note" aria-label={`Open ${title} externally`}>
              <p className="zen-pdf-eyebrow">External · opens in a new tab{host ? ` · ${host}` : ""}</p>
              <p className="zen-pdf-title">{title}</p>
              <ZenContext summary={summary} facts={facts} />
              <p className="zen-pdf-body">
                This site doesn&apos;t allow embedding, so Zen Mode won&apos;t frame it — no bypass,
                no broken preview. Open it externally; your place here is kept.
              </p>
              <div className="zen-pdf-actions">
                {originUrl ? (
                  <a
                    href={originUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="zen-btn zen-btn-light"
                    aria-label={`Open ${title} externally in a new tab`}
                  >
                    <ExternalLink size={14} aria-hidden="true" /> Open externally
                  </a>
                ) : null}
                <button type="button" onClick={onClose} className="zen-btn zen-btn-ghost">
                  Back to roadmap
                </button>
              </div>
            </div>
          ) : outcome === ZEN_OUTCOME.PDF ? (
            <div className="zen-pdf" role="note" aria-label={`Open ${title} externally`}>
              <p className="zen-pdf-eyebrow">PDF · opens in your browser{host ? ` · ${host}` : ""}</p>
              <p className="zen-pdf-title">{title}</p>
              <ZenContext summary={summary} facts={facts} />
              <p className="zen-pdf-body">
                Browsers block their built-in PDF viewer inside sandboxed frames, and an
                unsandboxed frame would run anything a mislabelled “.pdf” URL serves — so Zen
                Mode doesn’t preview PDFs inline. Your browser’s own viewer is the safe seat.
              </p>
              <div className="zen-pdf-actions">
                {originUrl ? (
                  <a
                    href={originUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="zen-btn zen-btn-light"
                    aria-label={`Open ${title} PDF externally in a new tab`}
                  >
                    <ExternalLink size={14} aria-hidden="true" /> Open PDF externally
                  </a>
                ) : null}
                <button type="button" onClick={onClose} className="zen-btn zen-btn-ghost">
                  Back to roadmap
                </button>
              </div>
            </div>
          ) : (
            <>
              {view.showLoading ? (
                <div className="zen-loading" role="status" aria-label={`Loading ${title}`}>
                  <div className="skel" style={{ height: 14, width: "38%" }} aria-hidden="true" />
                  <div className="skel mt-3" style={{ height: 14, width: "62%" }} aria-hidden="true" />
                  <p className="zen-loading-text">Preparing a quiet place to learn…</p>
                  {status === "site" ? (
                    <button
                      type="button"
                      onClick={showFallback}
                      className="zen-btn zen-btn-ghost"
                      style={{ pointerEvents: "auto", marginTop: "1rem" }}
                      aria-label={`Show external-opening options for ${title}`}
                    >
                      Blocked? View options
                    </button>
                  ) : null}
                </div>
              ) : null}
              {embedUrl ? (
                <iframe
                  key={`${resourceKey}::${stage.frameKey}`}
                  src={embedUrl}
                  title={title}
                  className="zen-frame"
                  style={{ visibility: view.iframeVisible ? "visible" : "hidden" }}
                  allow={iframeAllow(status)}
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  {...(status === "site"
                    ? { sandbox: "allow-scripts allow-same-origin" }
                    : {})}
                  onLoad={onFrameLoad}
                  onError={onFrameError}
                />
              ) : null}
            </>
          )}
          {view.showSitePanel && siteFallback ? (
            <div className="zen-site-fallback" role="note" aria-label={`${title} unavailable inline`}>
              <p className="zen-pdf-eyebrow">{siteFallback.eyebrow}{host ? ` · ${host}` : ""}</p>
              <p className="zen-pdf-title">{siteFallback.title}</p>
              <ZenContext summary={summary} facts={facts} />
              <p className="zen-pdf-body">{siteFallback.body}</p>
              <div className="zen-pdf-actions">
                {originUrl ? (
                  <a
                    href={originUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="zen-btn zen-btn-light"
                    aria-label={`Open ${title} externally in a new tab`}
                  >
                    <ExternalLink size={14} aria-hidden="true" /> Open externally
                  </a>
                ) : null}
                <button type="button" onClick={retry} className="zen-btn zen-btn-ghost">
                  Try again
                </button>
                <button type="button" onClick={onClose} className="zen-btn zen-btn-ghost">
                  Back to roadmap
                </button>
              </div>
            </div>
          ) : null}
          {view.showInlineHint ? (
            <div className="zen-fallback" role="note">
              <p className="zen-fallback-title">Still loading?</p>
              <p className="zen-fallback-body">
                Some sites block embedding, and slow connections look the same from here. Zen Mode can&apos;t
                tell the difference — opening externally always works.
              </p>
              <div className="zen-fallback-actions">
                {originUrl ? (
                  <a href={originUrl} target="_blank" rel="noopener noreferrer" className="zen-btn zen-btn-light">
                    <ExternalLink size={14} aria-hidden="true" /> Open externally
                  </a>
                ) : null}
                <button type="button" onClick={retry} className="zen-btn zen-btn-ghost">
                  Try again
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <style>{`
          .zen-backdrop {
            position: fixed; inset: 0; z-index: 80;
            background: rgba(4, 5, 6, 0.72);
          }
          .zen-panel {
            position: fixed; inset: 0; z-index: 81;
            display: flex; flex-direction: column;
            background: #0a0c0e; color: #f2f5f6;
          }
          @media (min-width: 900px) {
            .zen-panel { inset: 3vh 4vw; border-radius: 18px; overflow: hidden;
              border: 1px solid rgba(255,255,255,0.12);
              box-shadow: 0 40px 120px rgba(0,0,0,0.55); }
          }
          .zen-head {
            display: flex; align-items: flex-start; justify-content: space-between;
            gap: 1rem; padding: 0.9rem 1rem;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.02);
          }
          .zen-eyebrow {
            font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase;
            color: #9fb3bd; margin: 0;
          }
          .zen-title {
            margin: 0.25rem 0 0; font-size: 1rem; font-weight: 600; line-height: 1.4;
            color: #f2f5f6; overflow-wrap: anywhere;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
          }
          .zen-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
          .zen-btn {
            display: inline-flex; align-items: center; gap: 0.4rem;
            border: 1px solid rgba(255,255,255,0.16); border-radius: 10px;
            background: rgba(255,255,255,0.06); color: #f2f5f6;
            font-size: 0.8rem; font-weight: 600; padding: 0.45rem 0.7rem;
            cursor: pointer; text-decoration: none;
            transition: background 0.15s ease-out, transform 0.15s ease-out;
          }
          .zen-btn:hover { background: rgba(255,255,255,0.12); }
          .zen-btn:active { transform: scale(0.97); }
          .zen-icon-btn { padding: 0.5rem; }
          .zen-btn-label { white-space: nowrap; }
          @media (max-width: 560px) { .zen-btn-label { display: none; } }
          .zen-btn-light { background: #f2f5f6; color: #0a0c0e; border-color: #f2f5f6; }
          .zen-btn-light:hover { background: #ffffff; }
          .zen-btn-ghost { background: transparent; }
          .zen-note {
            margin: 0; padding: 0.5rem 1rem; font-size: 0.78rem; color: #c8d4da;
            border-bottom: 1px solid rgba(255,255,255,0.08);
          }
          .zen-stage { position: relative; flex: 1; min-height: 0; background: #0a0c0e; }
          .zen-frame { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; border: 0; background: #111417; }
          /* Opaque and explicitly above the frame: a refusal page painting
             late underneath can never cover these controls. */
          .zen-site-fallback {
            position: absolute; inset: 0; z-index: 2;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center; text-align: center;
            gap: 0.25rem; padding: 2rem; background: #0d1013;
          }
          .zen-loading {
            position: absolute; inset: 0; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 0.25rem; padding: 2rem;
            pointer-events: none;
          }
          .zen-loading .skel { max-width: 320px; }
          .zen-loading-text { margin-top: 1rem; font-size: 0.85rem; color: #9fb3bd; }
          .zen-fallback {
            position: absolute; left: 50%; bottom: 1.25rem; transform: translateX(-50%);
            width: min(560px, calc(100% - 2rem));
            background: rgba(17, 20, 23, 0.96); color: #e8edef;
            border: 1px solid rgba(255,255,255,0.14); border-radius: 14px;
            padding: 1rem 1.1rem; box-shadow: 0 16px 48px rgba(0,0,0,0.5);
          }
          .zen-fallback-title { margin: 0; font-size: 0.85rem; font-weight: 700; }
          .zen-fallback-body { margin: 0.35rem 0 0; font-size: 0.82rem; line-height: 1.55; color: #b9c6cd; }
          .zen-fallback-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.8rem; }
          .zen-pdf {
            position: absolute; inset: 0; display: flex; flex-direction: column;
            align-items: center; justify-content: center; text-align: center;
            gap: 0.25rem; padding: 2rem;
          }
          .zen-pdf-eyebrow {
            margin: 0; font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase;
            color: #9fb3bd;
          }
          .zen-pdf-title {
            margin: 0.5rem 0 0; font-size: 1.25rem; font-weight: 600; line-height: 1.4;
            color: #f2f5f6; max-width: 34ch; overflow-wrap: anywhere;
          }
          .zen-pdf-body { margin: 0.75rem 0 0; font-size: 0.88rem; line-height: 1.65; color: #b9c6cd; max-width: 52ch; }
          .zen-context {
            margin-top: 1rem; width: min(620px, 100%);
            border-left: 2px solid rgba(255,255,255,0.18);
            padding: 0.15rem 0 0.15rem 0.95rem; text-align: left;
          }
          .zen-context-label {
            margin: 0; font-size: 0.66rem; letter-spacing: 0.12em; text-transform: uppercase;
            color: #8fa3ad;
          }
          .zen-context-text {
            margin: 0.4rem 0 0; font-size: 0.92rem; line-height: 1.7; color: #dbe4e8;
          }
          .zen-facts {
            list-style: none; display: flex; flex-wrap: wrap; justify-content: center;
            gap: 0.4rem; margin: 1rem 0 0; padding: 0;
          }
          .zen-facts li {
            font-size: 0.72rem; letter-spacing: 0.04em; text-transform: capitalize;
            color: #c8d4da; border: 1px solid rgba(255,255,255,0.14);
            border-radius: 999px; padding: 0.22rem 0.6rem;
          }
          .zen-pdf-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; margin-top: 1.25rem; }
          @media (prefers-reduced-motion: reduce) {
            .zen-btn { transition: none; }
          }
        `}</style>
      </motion.section>
    </AnimatePresence>
  );
}
