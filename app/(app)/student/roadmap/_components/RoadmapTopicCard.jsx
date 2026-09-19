import Link from "next/link";
import { MarkCompleteButton } from "@/components/actions";

/* One map stop expanded: description, real linked resources,
   real linked builds, and the honest completion control.
   All styling uses LOOM theme tokens — no hardcoded palette. */
export function RoadmapTopicCard({
  node,
  index,
  isDone,
  isNext,
  isSelected,
  justCompleted,
  resources,
  resourceDoneSet,
  projects,
  onOpen,
}) {
  const totalMins = (resources || []).reduce((s, r) => s + (r.minutes || 0), 0);
  const learnDone = (resources || []).filter((r) => resourceDoneSet?.has(r.id)).length;

  return (
    <article
      aria-labelledby={`rm-title-${node.id}`}
      className={`rm-card ${isSelected ? "halo" : ""} ${justCompleted ? "line-illuminate" : ""}`}
    >
      <p className="meta">
        Milestone {String(index + 1).padStart(2, "0")}
        {node.difficulty_level ? ` · ${node.difficulty_level}` : ""}
        {isDone ? " · completed" : isNext ? " · you are here" : ""}
      </p>
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="mt-2 w-full text-left"
      >
        <span
          id={`rm-title-${node.id}`}
          className="font-display block text-xl font-medium leading-7 hover:underline"
          style={{ color: "var(--text)" }}
        >
          {isDone && <span style={{ color: "var(--accent)" }}>✓ </span>}
          {node.title}
        </span>
      </button>
      {node.description && (
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
          {node.description}
        </p>
      )}

      <p className="meta mt-4">
        Learn · {(resources || []).length} pieces
        {totalMins ? ` · ≈ ${totalMins} min` : ""}
        {learnDone ? ` · ${learnDone} finished` : ""}
      </p>
      {(resources || []).length > 0 ? (
        <ul className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
          {(resources || []).slice(0, 6).map((r) => {
            const rDone = resourceDoneSet?.has(r.id);
            return (
              <li key={r.id}>
                <Link
                  href={`/student/resources/${r.id}`}
                  prefetch={false}
                  className="row-link flex items-baseline justify-between gap-3 px-2 py-2"
                >
                  <span
                    className="min-w-0 truncate text-sm font-medium"
                    style={{ color: "var(--text)" }}
                  >
                    {rDone && <span style={{ color: "var(--accent)" }}>✓ </span>}
                    {r.title}
                  </span>
                  <span className="meta shrink-0">
                    {r.kind ? `${r.kind} · ` : ""}
                    {r.minutes ? `${r.minutes} min` : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          No linked material yet — mentors add it as the track matures.
        </p>
      )}

      <p className="meta mt-5">Build · {(projects || []).length} linked</p>
      {(projects || []).length > 0 ? (
        <ul className="mt-2 space-y-1">
          {(projects || []).slice(0, 3).map((p) => (
            <li key={p.id}>
              <Link
                href={`/student/projects/${p.id}`}
                prefetch={false}
                className="row-link flex items-baseline justify-between gap-3 px-2 py-2"
              >
                <span
                  className="min-w-0 truncate text-sm font-medium"
                  style={{ color: "var(--text)" }}
                >
                  {p.title}
                </span>
                <span className="meta shrink-0">{p.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          No build linked yet.{" "}
          <Link
            href="/student/projects/new"
            prefetch={false}
            className="font-semibold hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Start a project →
          </Link>
        </p>
      )}

      <div
        className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4"
        style={{ borderColor: "var(--line)" }}
      >
        <MarkCompleteButton nodeId={node.id} completed={isDone} />
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="text-xs font-semibold hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            Details ›
          </button>
          <Link
            href={`/student/roadmap/${node.id}`}
            prefetch={false}
            className="text-xs font-semibold hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Open page →
          </Link>
        </span>
      </div>
    </article>
  );
}
