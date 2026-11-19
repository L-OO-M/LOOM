/* Shared skeleton body for the public routes.
   The marketing pages are fully dynamic, so before this existed a route change
   left the band under the header empty for 400-700 ms. These bars reserve the
   real geometry (masthead, lede, first block) so nothing jumps when the page
   lands. Route files keep their own `aria-busy` wrapper so their live-region
   contract stays visible where it is asserted. */
export function PublicLoadingSkeleton({ cards = 3 }) {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-6xl px-5 pt-20 pb-24 sm:px-8 sm:pt-28">
      <div className="skel" style={{ height: 11, width: 92 }} />
      <div className="skel mt-6" style={{ height: 46, width: "min(620px, 78%)" }} />
      <div className="skel mt-3" style={{ height: 46, width: "min(440px, 52%)" }} />
      <div className="skel mt-7" style={{ height: 14, width: "min(560px, 70%)" }} />
      <div className="skel mt-2.5" style={{ height: 14, width: "min(460px, 56%)" }} />
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="skel" style={{ height: 208, borderRadius: 18 }} />
        ))}
      </div>
    </div>
  );
}
