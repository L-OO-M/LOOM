import Link from "next/link";

/* 404: the address doesn't exist on this loom. Say so plainly, offer the
   real destinations — never a dead end. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center px-5 py-16 text-center" style={{ background: "var(--bg)" }}>
      <p className="kicker">No such thread</p>
      <p className="font-display mt-4 text-7xl font-medium sm:text-8xl" style={{ color: "var(--accent)" }} aria-hidden="true">
        404
      </p>
      <h1 className="font-display mt-4 text-3xl font-medium sm:text-4xl" style={{ color: "var(--text)" }}>
        This page was never woven.
      </h1>
      <p className="mt-5 max-w-md leading-7" style={{ color: "var(--text-muted)" }}>
        The address is mistyped, moved, or never existed. Everything real lives one tap away:
      </p>
      <div className="mt-8 grid w-full max-w-md grid-cols-2 gap-3">
        {[
          ["Home", "/", "Start over"],
          ["About", "/about", "What LOOM is"],
          ["Events", "/events", "What's on"],
          ["Domains", "/domains", "Pick a track"],
          ["FAQ", "/faq", "Straight answers"],
          ["Sign in", "/login", "Your dashboard"]
        ].map(([label, href, sub]) => (
          <Link key={href + label} href={href} prefetch={false} className="rounded-2xl border p-4 text-left transition hover:-translate-y-0.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <span className="block text-sm font-semibold" style={{ color: "var(--text)" }}>{label}</span>
            <span className="meta mt-0.5 block">{sub}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
