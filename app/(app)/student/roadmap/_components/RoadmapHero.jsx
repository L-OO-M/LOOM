import Link from "next/link";
import { Display, Meta } from "@/components/loom/primitives";
import { ProgressPath } from "@/components/loom/ProgressPath";
import { Reveal } from "@/components/motion/Reveal";

const DOMAIN_LABEL = {
  ai_ml: "AI / ML",
  web: "Web Development",
  cybersecurity: "Cybersecurity",
  dsa: "DSA",
  blockchain: "Blockchain",
  backend: "Backend",
  devops: "DevOps",
};

/* Top of the map: title, honest progress, current position,
   next recommended step, and jump links into the stages below. */
export function RoadmapHero({ nodes, doneIds, nextId }) {
  const total = nodes.length;
  const doneCount = doneIds.length;
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const next = nextId ? nodes.find((n) => n.id === nextId) ?? null : null;
  const nextIndex = next ? nodes.findIndex((n) => n.id === next.id) : -1;

  const stops = nodes.map((n) => ({
    label: n.title,
    state: doneIds.includes(n.id) ? "done" : n.id === nextId ? "now" : "todo",
  }));

  const stages = [];
  for (const n of nodes) {
    if (!stages.includes(n.domain)) stages.push(n.domain);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <Reveal>
        <Meta>
          Roadmap · {doneCount} of {total} in place
        </Meta>
        <Display size="lg" className="mt-3">
          Walk the path.
        </Display>
        <p className="narrative mt-4 max-w-2xl" style={{ color: "var(--text)" }}>
          Foundations to production — one stage at a time. Follow the central
          path downward, branch into each topic&apos;s material, build
          something real, and the map fills in behind you.
        </p>

        <div className="mt-8">
          <ProgressPath
            stops={stops}
            percent={percent}
            ariaLabel={`${percent} percent of roadmap complete`}
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
            <dt className="meta">Current stage</dt>
            <dd className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
              {next ? `${DOMAIN_LABEL[next.domain] || next.domain}` : "Path complete"}
            </dd>
          </div>
          <div
            className="rounded-2xl border px-4 py-3"
            style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
          >
            <dt className="meta">Up next</dt>
            <dd className="mt-1 truncate text-sm font-semibold" style={{ color: "var(--text)" }}>
              {next ? next.title : "Turn work into proof"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {next ? (
            <a href={`#rm-node-${next.id}`} className="btn-ink">
              Continue roadmap
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

        {stages.length > 1 && (
          <nav className="mt-8 flex flex-wrap gap-2" aria-label="Jump to a stage">
            {stages.map((d, i) => (
              <a
                key={d}
                href={`#rm-stage-${d}`}
                className="rounded-full border px-3.5 py-1.5 text-xs font-semibold transition hover:opacity-80"
                style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
              >
                {String(i + 1).padStart(2, "0")} · {DOMAIN_LABEL[d] || d}
              </a>
            ))}
          </nav>
        )}
      </Reveal>
    </div>
  );
}
