import Link from "next/link";
import { publicFooterLinks } from "@/lib/nav";
import { SITE_YEAR } from "@/lib/site";

/* The final knot for public pages: mantra, registers, cross-links.
   The link list lives in lib/nav.js so the homepage footer cannot drift from
   this one, and the copyright comes from lib/site.js so both read one year. */
export function PublicFooter() {
  return (
    <footer className="px-5 py-16 lg:px-8" style={{ background: "#101314", color: "#f2f3f1" }}>
      <div className="mx-auto max-w-7xl">
        <p className="font-display mx-auto max-w-2xl text-center text-2xl font-medium sm:text-3xl">
          Students Learn → Students Build → <em className="font-light">Students Mentor → Students Contribute.</em>
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/register" prefetch={false} className="btn-ink !py-2.5">Get started</Link>
          <Link href="/" prefetch={false} className="justify-center !px-5 !py-2.5 !text-sm font-semibold transition hover:opacity-85" style={{ color: "#f2f3f1", border: "1px solid rgba(242,243,241,0.3)", borderRadius: 10 }}>
            Back home
          </Link>
        </div>
        <div className="mt-12 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm sm:gap-x-8 sm:gap-y-3" style={{ color: "rgba(242,243,241,0.6)" }}>
          {publicFooterLinks.map(([label, href]) => (
            <Link key={href} prefetch={false} href={href} className="tap-target transition hover:opacity-100 hover:underline">
              {label}
            </Link>
          ))}
        </div>
        <p className="mt-8 text-center font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: "rgba(242,243,241,0.62)" }} aria-hidden="true">
          ——— the thread continues ———
        </p>
        <div className="mt-6 flex flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:justify-between" style={{ borderColor: "rgba(242,243,241,0.15)", color: "rgba(242,243,241,0.5)" }}>
          <p>© {SITE_YEAR} LOOM</p>
          <p>Beginner-friendly. Contribution-driven.</p>
        </div>
      </div>
    </footer>
  );
}
