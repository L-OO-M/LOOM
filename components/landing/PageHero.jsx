import { WeaveField } from "@/components/WeaveField";

/* Landing-language hero for the public pages: navy weave, gold kicker,
   serif display, honest lede. Compact by design — these pages answer
   questions, the landing tells the story. */
export function PageHero({ kicker, title, lede, actions = null }) {
  return (
    <section className="relative overflow-hidden" style={{ background: "#0a1628" }} aria-label="Introduction">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{
        background: "radial-gradient(52rem 30rem at 12% -8%, rgba(232,194,106,0.16), transparent 60%), radial-gradient(48rem 32rem at 88% 108%, rgba(63,210,224,0.13), transparent 62%)"
      }} />
      <WeaveField />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden="true" style={{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")"
      }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20" aria-hidden="true" style={{ background: "linear-gradient(to bottom, transparent, rgba(10,22,40,0.9))" }} />
      <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-16 sm:px-6 sm:pt-20 lg:px-8">
        <p className="kicker flex items-center gap-3" style={{ color: "#e8c26a" }}>
          <span className="inline-block h-px w-8" style={{ background: "#e8c26a" }} />
          {kicker}
        </p>
        <h1 className="font-display mt-5 max-w-4xl text-5xl font-medium leading-[1.02] sm:text-6xl" style={{ color: "#f4f1e8" }}>
          {title}
        </h1>
        {lede && (
          <p className="mt-6 max-w-2xl text-base leading-8" style={{ color: "rgba(244,241,232,0.72)" }}>
            {lede}
          </p>
        )}
        {actions && <div className="mt-8 flex flex-col gap-3 sm:flex-row">{actions}</div>}
      </div>
    </section>
  );
}
