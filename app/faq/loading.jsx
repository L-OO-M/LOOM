import { PublicFooter } from "@/components/landing/PublicFooter";
import { PublicLoadingSkeleton } from "@/components/landing/PublicLoadingSkeleton";
import "./_components/faq.css";

// Previously this rendered the whole marquee from static data, which mounted a
// second set of 60s animations before the real page landed. A skeleton keeps the
// transition quiet and the heading order untouched.
export default function Loading() {
  return (
    <>
      <div className="loom-faq-exact" aria-busy="true" aria-live="polite">
        <div className="faq-page-bg min-h-screen">
          <span className="sr-only" role="status">Loading questions…</span>
          <PublicLoadingSkeleton cards={3} />
        </div>
      </div>
      <PublicFooter />
    </>
  );
}
