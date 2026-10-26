"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: a failure while rendering the ROOT layout itself, which
 * app/error.jsx cannot catch because the layout is what error.jsx lives inside.
 *
 * It must render its own <html>/<body> -- by the time this runs there is no
 * document to attach to.
 */
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    // No error tracker is wired yet (SENTRY_DSN is empty), so the console is
    // the only signal this produces. Keep it, and never swallow silently.
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#0a1628",
          color: "#f4f1e8",
          fontFamily: "system-ui, sans-serif",
          padding: "2rem"
        }}
      >
        <main style={{ maxWidth: "34rem", textAlign: "center" }}>
          <p
            style={{
              fontSize: "0.75rem",
              letterSpacing: "0.3em",
              color: "#e8c26a",
              margin: 0
            }}
          >
            LOOM
          </p>
          <h1 style={{ fontSize: "1.75rem", margin: "1rem 0 0.5rem", fontWeight: 700 }}>
            Something broke on our side
          </h1>
          <p style={{ color: "rgba(244,241,232,0.7)", lineHeight: 1.6, margin: 0 }}>
            This is not your fault. Try again, or go back to the start.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "1.75rem" }}>
            <button
              onClick={reset}
              style={{
                cursor: "pointer",
                border: "none",
                borderRadius: "999px",
                padding: "0.65rem 1.5rem",
                fontSize: "0.9rem",
                fontWeight: 700,
                background: "#e8c26a",
                color: "#0a1628"
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                borderRadius: "999px",
                padding: "0.65rem 1.5rem",
                fontSize: "0.9rem",
                fontWeight: 700,
                border: "1px solid rgba(232,194,106,0.34)",
                color: "#e8c26a",
                textDecoration: "none"
              }}
            >
              Back to start
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
