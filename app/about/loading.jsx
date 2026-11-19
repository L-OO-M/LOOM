import { PublicLoadingSkeleton } from "@/components/landing/PublicLoadingSkeleton";

// Reserves the masthead + first block so the band under the header is never
// empty during a route change. No page heading: the incoming page owns it.
export default function Loading() {
  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "var(--bg)", color: "var(--text)" }} aria-busy="true" aria-live="polite">
      <span className="sr-only" role="status">Loading About LOOM…</span>
      <PublicLoadingSkeleton cards={2} />
    </div>
  );
}
