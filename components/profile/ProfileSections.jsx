import Link from "next/link";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";

/**
 * The three sections every profile surface shows: what they are building, the
 * proof they have earned, and what people vouch for. The public share card and
 * the in-app profile render this same block; only the "latest project" link and
 * the per-proof action differ, so those come in as props.
 *
 * Server component — no client hooks, so the public card stays crawlable.
 */
export function ProfileSections({
  achievements = [],
  proofCounts = [],
  skills = [],
  endorsementCount = null,
  latestProject = null,
  projectHref = null,
  proofAction = null,
  proofFooter = null,
  endorsementFooter = null,
  showEndorsements = true,
}) {
  const project = latestProject?.[0] || null;
  return (
    <>
      {project ? (
        <section aria-labelledby="building-heading" className="mt-8">
          <h2 id="building-heading" className="meta">Building</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Latest:{" "}
            {projectHref ? (
              <Link href={projectHref(project)} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>
                {project.title}
              </Link>
            ) : (
              // The public card renders for signed-out viewers; the project
              // detail route is authenticated, so the name is shown unlinked.
              <span className="font-semibold" style={{ color: "var(--text)" }}>{project.title}</span>
            )}
          </p>
        </section>
      ) : null}

      <div className="mt-10 grid gap-10 sm:grid-cols-2">
        <section aria-labelledby="proof-heading">
          <h2 id="proof-heading" className="meta">The proof</h2>
          {achievements.length === 0 ? (
            <p className="narrative mt-3">
              {proofCounts.length > 0 ? `${proofCounts.join(" · ")}.` : "No proof recorded yet."}{" "}
              Badges land here as they are earned.
            </p>
          ) : (
            <Timeline className="mt-4">
              {achievements.map((a) => (
                <TimelineItem
                  key={a.id}
                  state="done"
                  title={a.badge_name || `${a.source_type} achievement`}
                  meta={new Date(a.earned_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                  action={proofAction ? proofAction(a) : undefined}
                />
              ))}
            </Timeline>
          )}
          {proofFooter}
        </section>

        <section aria-labelledby="known-for-heading">
          <h2 id="known-for-heading" className="meta">{showEndorsements ? `Known for · ${endorsementCount ?? skills.length}` : "Known for"}</h2>
          {!showEndorsements ? (
            <p className="narrative mt-3">This member has hidden their endorsements.</p>
          ) : skills.length === 0 ? (
            <p className="narrative mt-3">No endorsements yet — vouch for a skill you have seen in action.</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {skills.map((s) => (
                <li key={s.skill}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate" style={{ color: "var(--text)" }}>{s.skill}</span>
                    <span className="shrink-0 font-mono" style={{ color: "var(--text-muted)" }}>×{s.n}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: "var(--bg-muted)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.n * 25)}%`, background: "var(--accent)" }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {endorsementFooter}
        </section>
      </div>
    </>
  );
}
