"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

/* Right-side drawer — node details, previews, inbox. A real modal: Escape
   closes, initial focus lands on the close button, Tab is trapped inside the
   panel, and focus returns to the opener once the drawer closes. */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Drawer({ open, onClose, label, children }) {
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);

  // The parent passes an inline onClose, so its identity changes on every
  // render; read the latest one from a ref instead of re-running the effect
  // (a re-run would restore focus to the opener while the drawer is open).
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Capture the opener during render, before autoFocus moves focus into the
  // mounted panel (React applies autoFocus in commit, before passive effects,
  // so an effect would only ever see the close button).
  if (open !== wasOpenRef.current) {
    if (open) {
      const active = typeof document !== "undefined" ? document.activeElement : null;
      triggerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    wasOpenRef.current = open;
  }

  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      // Recomputed on every Tab: the notification list can load or change
      // while the drawer is open, so a cached list would go stale.
      const focusables = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const outside = !panel.contains(active);

      if (e.shiftKey) {
        if (active === first || outside) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || outside) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      // AnimatePresence keeps the panel mounted through its exit animation and
      // unmounts it afterwards, so restore here in cleanup — onExitComplete
      // is not guaranteed to run (component unmount, rapid toggles).
      const trigger = triggerRef.current;
      if (trigger && trigger.isConnected) trigger.focus();
      triggerRef.current = null;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            ref={panelRef}
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
              <p className="meta">{label}</p>
              <button
                onClick={onClose}
                autoFocus
                className="rounded-lg p-1.5 transition hover:bg-[var(--bg-muted)] active:scale-95"
                style={{ color: "var(--text-muted)" }}
                aria-label="Close panel"
              >
                <X size={17} />
              </button>
            </div>
            <div className="flex-1 px-5 py-5">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
