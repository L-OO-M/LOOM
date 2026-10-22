import "./events.css";

// A neutral surface prevents the retired hero from flashing during navigation.
export default function Loading() {
  return (
    <div className="loom-events min-h-screen" aria-busy="true" aria-live="polite">
      <span className="sr-only" role="status">Loading events…</span>
    </div>
  );
}
