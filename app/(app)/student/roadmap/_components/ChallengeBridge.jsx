import Link from "next/link";
import { StatusPill } from "@/components/loom/primitives";
import { domainLabel } from "@/lib/domains";

/**
 * The bridge between reading and doing.
 *
 * A roadmap that only ever says "continue" teaches members to consume. This
 * panel sits beside the path and says, once there is enough context, that the
 * next useful move is attempting something in their own track. It is honest
 * about an empty catalogue: it still links to the weekly set, and says no
 * domain challenge is published yet.
 */
export function ChallengeBridge({ nudge, overview, percent = 0 }) {
  if (!nudge) return null;
  const items = [...(overview?.debug?.items || []), ...(overview?.contests?.items || [])].slice(0, 2);
  const domain = overview?.domain || "dsa";

  return (
    <section
      aria-labelledby="challenge-bridge-title"
      className="mx-4 mb-4 overflow-hidden rounded-3xl border sm:mx-6"
      style={{
        borderColor: "color-mix(in srgb, var(--accent) 26%, var(--line))",
        background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--bg-elevated)), var(--bg-elevated) 65%)"
      }}
    >
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>
            {domainLabel(domain)} / beyond the path
          </p>
          <h2 id="challenge-bridge-title" className="mt-1 text-xl font-semibold sm:text-2xl" style={{ color: "var(--text)" }}>
            {nudge.title}
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>{nudge.body}</p>
          {items.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {items.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
                    style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
                  >
                    <StatusPill>{item.kind === "debug" ? "Debug" : "Contest"}</StatusPill>
                    <span className="max-w-[16rem] truncate">{item.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end">
          <div className="rounded-2xl border px-4 py-3 text-center" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
            <p className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{percent}%</p>
            <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>track verified</p>
          </div>
          <Link href={nudge.href} prefetch={false} className="btn-ink whitespace-nowrap !py-2.5 text-sm">
            {nudge.cta} &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
