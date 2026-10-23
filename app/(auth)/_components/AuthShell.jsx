import { BrandMark } from "@/components/BrandMark";
import Link from "next/link";
import "./auth.css";

/**
 * Shared frame for /login and /register.
 *
 * The old pages stacked a ghost wordmark, an ambient wash, a five-level role
 * guide and three competing sign-in affordances in one narrow column. That is
 * why they read as a mess: no single primary action, and the actual form was
 * buried under prose.
 *
 * This frame keeps the brand story on one side (desktop only) and gives the
 * form a single focused column. It is a server component — no client JS.
 */
export function AuthShell({ children }) {
  return (
    <main id="main" className="loom-auth min-h-[100dvh] lg:grid lg:grid-cols-[1.02fr_1fr]" style={{ background: "var(--bg)" }}>
      <aside
        className="relative hidden flex-col justify-between overflow-hidden border-r p-10 lg:flex xl:p-14"
        style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}
        aria-hidden="true"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(38rem 24rem at 8% 4%, var(--wash), transparent 68%), radial-gradient(30rem 22rem at 92% 96%, var(--wash), transparent 70%)"
          }}
        />
        <div className="relative">
          <BrandMark size={30} />
        </div>

        <div className="relative max-w-md">
          <p className="kicker">The loop</p>
          <h2 className="font-display mt-4 text-4xl font-medium leading-[1.08] xl:text-5xl" style={{ color: "var(--text)" }}>
            Students learn.<br />
            Students build.<br />
            <em className="font-light">Students mentor.</em>
          </h2>
          <p className="mt-6 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
            One account carries your roadmap, projects, proof and department membership
            across the whole chapter.
          </p>

          <dl className="mt-10 space-y-4">
            {[
              ["01", "Learn", "Structured roadmaps, workshops and resources — no prior skill needed."],
              ["02", "Build", "Ship real projects and contribute to open source with your department."],
              ["03", "Prove", "Verified GitHub activity and credentials that travel with you."]
            ].map(([n, title, body]) => (
              <div key={n} className="flex gap-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                <span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>{n}</span>
                <div>
                  <dt className="text-sm font-semibold" style={{ color: "var(--text)" }}>{title}</dt>
                  <dd className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{body}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-xs leading-5" style={{ color: "var(--text-muted)" }}>
          Access is earned or granted — never self-selected.{" "}
          <Link prefetch={false} href="/about" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            How L.O.O.M. works
          </Link>
        </p>
      </aside>

      <section className="flex min-h-[100dvh] items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden">
            <BrandMark size={28} />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

/** Small, consistent field label + control wrapper for the auth forms. */
export function AuthField({ id, label, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="block text-sm font-medium" style={{ color: "var(--text)" }}>{label}</label>
        {hint && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export const authInputClass =
  "mt-1.5 block min-h-[44px] w-full rounded-lg border bg-[var(--bg)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--accent)]";
