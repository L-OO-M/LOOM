import Link from "next/link";
import { Display, Meta } from "@/components/loom/primitives";
import { ProgressPath } from "@/components/loom/ProgressPath";
import { Reveal } from "@/components/motion/Reveal";
import { domainLabel } from "@/lib/domains";

/* Top of the map: title, honest progress, current position,
   next recommended step. The stage jump-nav was removed — the domain rail in
   RoadmapTabs now owns cross-navigation, so the page stopped repeating itself. */
export function RoadmapHero({ nodes, doneIds, nextId, domain }) {
  const total = nodes.length;
  const doneCount = doneIds.length;
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const next = nextId ? nodes.find((n) => n.id === nextId) ?? null : null;
  const nextIndex = next ? nodes.findIndex((n) => n.id === next.id) : -1;

  const stops = nodes.map((n) => ({
    label: n.title,
    state: doneIds.includes(n.id) ? "done" : n.id === nextId ? "now" : "todo",
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <Reveal>
        <Meta>
          {domain ? `${domainLabel(domain)} · ` : "Roadmap · "}
          {doneCount} of {total} complete
        </Meta>
        <Display size="lg" className="mt-3">
          {domain ? domainLabel(domain) : "Walk the path."}
        </Display>
        <p className="narrative mt-4 max-w-2xl" style={{ color: "var(--text)" }}>
          Foundations to production — one topic at a time. Follow the path, branch
          into each topic&apos;s material, build something real, and the map fills
          in behind you.
        </p>

        <div className="mt-8">
          <ProgressPath
            stops={stops}
            percent={percent}
            ariaLabel={`${percent} percent of the ${domain ? domainLabel(domain) : "roadmap"} track complete`}
          />
        </div>

        <dl
          className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3"
          aria-label="Roadmap position"
        >
          <div
            className="rounded-2xl border px-4 py-3"
            style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
          >
            <dt className="meta">Completed</dt>
            <dd className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
              {doneCount} of {total} topics · {percent}%
            </dd>
          </div>
          <div
            className="rounded-2xl border px-4 py-3"
            style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
          >
            <dt className="meta">Track</dt>
            <dd className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
              {domain ? domainLabel(domain) : "Path complete"}
            </dd>
          </div>
          <div
            className="rounded-2xl border px-4 py-3"
            style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
          >
            <dt className="meta">Up next</dt>
            <dd className="mt-1 truncate text-sm font-semibold" style={{ color: "var(--text)" }}>
              {next ? next.title : percent === 100 ? "Track complete" : "Turn work into proof"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {next ? (
            <a href={`#rm-node-${next.id}`} className="btn-ink">
              Continue
              {nextIndex >= 0 && (
                <span aria-hidden="true" className="opacity-70">
                  · {next.title} →
                </span>
              )}
            </a>
          ) : (
            <Link href="/student/credentials" prefetch={false} className="btn-ink">
              Turn work into proof →
            </Link>
          )}
          <Link
            href="/student/resources"
            prefetch={false}
            className="text-sm font-semibold hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Browse the library
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
