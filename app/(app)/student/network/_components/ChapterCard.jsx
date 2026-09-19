import Link from "next/link";
import { StatusPill, ActionLink } from "@/components/loom/primitives";
import { initialsFor } from "@/lib/chapters";

// One chapter in the discovery grid. Server-rendered, no client JS:
// the whole card links to the chapter profile; inner content is presentational.
export function ChapterCard({ chapter, isMine }) {
  const domains = Array.isArray(chapter.domains) ? chapter.domains.filter(Boolean).slice(0, 3) : [];
  return (
    <article
      className="flex flex-col rounded-2xl border p-5 transition sm:p-6"
      style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
      aria-label={chapter.public_name}
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          style={{ background: "var(--bg-muted)", color: "var(--accent)", border: "1px solid var(--line)" }}
        >
          {initialsFor(chapter.public_name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>
            {chapter.public_name}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {isMine && <StatusPill tone="live">your chapter</StatusPill>}
            {chapter.is_featured && <StatusPill>featured</StatusPill>}
          </div>
        </div>
      </div>

      {chapter.mission && (
        <p className="mt-3 line-clamp-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
          {chapter.mission}
        </p>
      )}

      {domains.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`${chapter.public_name} domains`}>
          {domains.map((d) => (
            <li
              key={d}
              className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
              style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
            >
              {d}
            </li>
          ))}
        </ul>
      )}

      <p className="meta mt-4">
        {chapter.members} members · {chapter.oss_merges} merges · {chapter.projects} projects
      </p>

      <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
        <Link
          href={`/student/network/${chapter.slug}`}
          prefetch={false}
          className="row-link -mx-2 px-2 py-1 text-sm font-semibold"
          style={{ color: "var(--accent)" }}
          aria-label={`View ${chapter.public_name} chapter profile`}
        >
          View chapter →
        </Link>
      </div>
    </article>
  );
}

// Spotlight card for featured chapters: wider, identity-first.
export function FeaturedChapterCard({ chapter, isMine, rank }) {
  return (
    <article
      className="rounded-2xl border p-6 sm:p-8"
      style={{ borderColor: "var(--accent)", background: "var(--bg-elevated)" }}
      aria-label={`Featured: ${chapter.public_name}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
            style={{ background: "var(--bg-muted)", color: "var(--accent)", border: "1px solid var(--line)" }}
          >
            {initialsFor(chapter.public_name)}
          </span>
          <div className="min-w-0">
            <p className="meta" style={{ color: "var(--accent)" }}>
              Featured chapter{typeof rank === "number" ? ` · #${rank} by members` : ""}
            </p>
            <h3 className="font-display mt-1 text-2xl font-medium" style={{ color: "var(--text)" }}>
              {chapter.public_name}
            </h3>
            {chapter.mission && (
              <p className="mt-2 max-w-xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                {chapter.mission}
              </p>
            )}
          </div>
        </div>
        {isMine && <StatusPill tone="live">your chapter</StatusPill>}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--line)" }}>
        <p className="meta">
          {chapter.members} members · {chapter.oss_merges} merges · {chapter.projects} projects
        </p>
        <ActionLink href={`/student/network/${chapter.slug}`}>Explore the chapter</ActionLink>
      </div>
    </article>
  );
}
