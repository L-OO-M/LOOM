import Link from "next/link";
import { ResourceCompleteButton } from "@/components/actions";

/* Resources-only presentational pieces. Server components — the only
   client leaf is ResourceCompleteButton. All links are real filters or
   real navigation, every one with prefetch={false} (pooler rule). */

export function FilterLink({ href, active, small, children }) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-pressed={active}
      className={`transition active:scale-[0.97] ${small ? "px-3.5 py-1 text-xs" : "px-4 py-1.5 text-sm"} rounded-full font-medium`}
      style={active
        ? { background: "var(--text)", color: "var(--bg)" }
        : { background: "transparent", color: "var(--text-muted)", border: "1px solid var(--line)" }}
    >
      {children}
    </Link>
  );
}

export function ProgressBar({ percent, label }) {
  const pct = Math.max(0, Math.min(100, percent || 0));
  return (
    <div role={label ? "img" : undefined} aria-label={label || undefined}>
      <div
        className="res-progress-track"
        style={{ height: 6, borderRadius: 999, background: "var(--bg-muted)", overflow: "hidden" }}
      >
        <div
          className="res-progress-fill"
          style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "var(--accent)" }}
        />
      </div>
    </div>
  );
}

export function formatMinutes(minutes) {
  const m = Number(minutes) || 0;
  if (m >= 60 && m % 60 === 0) return `${m / 60} hr`;
  if (m > 60) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h}h ${rest}m` : `${h} hr`;
  }
  return `${m} min`;
}

export function kindLabel(kind) {
  if (kind === "doc") return "Doc";
  if (kind === "video") return "Video";
  if (kind === "course") return "Course";
  return "Article";
}

export function levelLabel(level) {
  if (!level) return "";
  if (level === "foundation") return "Foundation";
  if (level === "foundation_plus") return "Foundation plus";
  if (level === "intermediate") return "Intermediate";
  if (level === "advanced") return "Advanced";
  return String(level).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ResourceCard({ r, completed, recommended, trackLabel }) {
  return (
    <article
      className="res-card rounded-2xl border p-5 transition"
      style={{
        borderColor: completed ? "var(--accent)" : "var(--line)",
        background: "var(--bg-elevated)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{ border: "1px solid var(--line)", color: "var(--text-muted)" }}
        >
          {kindLabel(r.kind)}
        </span>
        {recommended && !completed && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ background: "var(--accent-glow)", color: "var(--accent-dark)", border: "1px solid var(--accent)" }}
          >
            Recommended
          </span>
        )}
        {completed && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--accent)" }}
          >
            ✓ Completed
          </span>
        )}
      </div>

      <Link
        href={`/student/resources/${r.id}`}
        prefetch={false}
        className="mt-3 block text-[1.02rem] font-semibold leading-7 hover:underline"
        style={{ color: "var(--text)" }}
      >
        {r.title}
      </Link>

      <p className="meta mt-2">
        {formatMinutes(r.minutes)}{r.level ? ` · ${levelLabel(r.level)}` : ""}{trackLabel ? ` · ${trackLabel}` : ""}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={`/student/resources/${r.id}`}
          prefetch={false}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97]"
          style={{ background: "var(--text)", color: "var(--bg)" }}
          aria-label={`${completed ? "Review" : "Open"} ${r.title}`}
        >
          {completed ? "Review" : "Open"}
        </Link>
        <ResourceCompleteButton resourceId={r.id} completed={completed} />
        {r.url && (
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold hover:underline"
            style={{ color: "var(--accent)" }}
            aria-label={`Open ${r.title} source in a new tab`}
          >
            Source ↗
          </a>
        )}
      </div>
    </article>
  );
}

export function TrackCard({ t, count, done, href, active }) {
  const pct = count > 0 ? Math.round((done / count) * 100) : 0;
  return (
    <Link
      href={href}
      prefetch={false}
      aria-pressed={active}
      aria-label={`Filter by ${t.label}, ${count} pieces`}
      className="res-track rounded-2xl border p-5 transition"
      style={{
        borderColor: active ? "var(--accent)" : "var(--line)",
        background: active ? "var(--accent-glow)" : "var(--bg-elevated)",
      }}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-base font-semibold" style={{ color: "var(--text)" }}>{t.label}</span>
        <span className="meta shrink-0">{count} pieces</span>
      </span>
      <span className="mt-1.5 block text-sm leading-6" style={{ color: "var(--text-muted)" }}>{t.focus}</span>
      <span className="mt-3 block">
        <ProgressBar percent={pct} label={`${t.label}: ${done} of ${count} finished`} />
      </span>
      <span className="meta mt-2 block">
        {done} of {count} finished{active ? " · selected" : ""}
      </span>
    </Link>
  );
}

export function ContinueCard({ r, trackLabel }) {
  return (
    <article
      className="res-card rounded-2xl border p-5 transition"
      style={{ borderColor: "var(--accent)", background: "var(--bg-elevated)" }}
    >
      <p className="meta" style={{ color: "var(--accent)" }}>Up next · {trackLabel}</p>
      <Link
        href={`/student/resources/${r.id}`}
        prefetch={false}
        className="mt-2 block text-[1.02rem] font-semibold leading-7 hover:underline"
        style={{ color: "var(--text)" }}
      >
        {r.title}
      </Link>
      <p className="meta mt-2">
        {kindLabel(r.kind)} · {formatMinutes(r.minutes)}{r.level ? ` · ${levelLabel(r.level)}` : ""}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={`/student/resources/${r.id}`}
          prefetch={false}
          className="btn-ink !py-2 text-sm"
          aria-label={`Continue with ${r.title}`}
        >
          Continue →
        </Link>
        <ResourceCompleteButton resourceId={r.id} completed={false} />
      </div>
    </article>
  );
}
