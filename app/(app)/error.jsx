"use client";

// Route-level error boundary for the whole app shell. Without this, a failed
// server render during navigation can leave the loading skeleton on screen
// forever — this surfaces the failure with a retry instead.
export default function AppError({ error, reset }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-28 text-center sm:px-6">
      <p className="font-mono text-xs tracking-[0.25em]" style={{ color: "var(--accent)" }}>
        SOMETHING SNAGGED A THREAD
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
        This page didn&rsquo;t load
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        {error?.message
          ? `The loom room reports: ${error.message}`
          : "The request didn’t make it back. Your work is safe — this is a loading hiccup, not lost data."}
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
