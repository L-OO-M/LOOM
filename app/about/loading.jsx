export default function Loading() {
  return (
    <div
      className="min-h-screen w-full"
      style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading About L.O.O.M.…</span>
    </div>
  );
}
