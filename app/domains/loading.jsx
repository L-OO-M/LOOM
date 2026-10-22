import "./domains.css";

// This boundary also wraps domain details. Keep it neutral so navigation never
// mounts a second catalogue before the requested page is ready.
export default function Loading() {
  return (
    <div className="loom-domains min-h-screen bg-grid" aria-busy="true" aria-live="polite">
      <span className="sr-only" role="status">Loading domain…</span>
    </div>
  );
}
