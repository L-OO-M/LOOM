import { PageHero } from "@/components/landing/PageHero";

export default function Loading() {
  return (
    <div className="min-h-[60dvh] w-full" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <PageHero kicker="L.O.O.M." title="One moment." lede="Fetching the latest from the chapter." headingLevel="h2" />
      <div className="mx-auto max-w-4xl px-5 py-12 sm:px-6 lg:px-8">
        <div className="skel" style={{ height: 16, width: "60%" }} />
        <div className="skel mt-3" style={{ height: 16, width: "85%" }} />
        <div className="skel mt-3" style={{ height: 16, width: "45%" }} />
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel" style={{ height: 96, width: "100%" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
