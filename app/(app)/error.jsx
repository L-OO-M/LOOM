"use client";

// Route-level error boundary for the whole app shell. Without this, a failed
// server render during navigation can leave the loading skeleton on screen
// forever — this surfaces the failure with a retry instead.
//
// The raw error message is logged to the console for diagnosis but NEVER
// rendered. It used to be shown to the user, which leaked Postgres internals
// into the browser: pooler host and port, constraint and column names, and the
// exact text of RLS denials — all of which describe the schema and the trust
// boundary to anyone who triggers an error.
export default function AppError({ error, reset }) {
  console.error("[app] route render failed:", error);

  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-28 text-center sm:px-6">
      <p className="font-mono text-xs tracking-[0.25em]" style={{ color: "var(--accent)" }}>
        SOMETHING SNAGGED A THREAD
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
        This page didn&rsquo;t load
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        The request didn&rsquo;t make it back. Your work is safe — this is a loading hiccup,
        not lost data.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button type="button" onClick={() => reset()} className="btn-ink">
          Try again
        </button>
        <button
          type="button"
          onClick={() => { window.location.href = "/student"; }}
          className="btn-ghost"
        >
          Back to Today
        </button>
      </div>
    </div>
  );
}
