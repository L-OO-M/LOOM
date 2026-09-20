"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MentorRequestButton } from "@/components/actions";
import { SegControl } from "@/components/loom/primitives";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "rated", label: "Rated" },
  { value: "new", label: "New" }
];

const SORTS = [
  { value: "recent", label: "Recent" },
  { value: "rated", label: "Top rated" },
  { value: "sessions", label: "Most sessions" }
];

// Client island: search / filter / sort over the server-loaded ≤50 mentors.
// No fetching here — the page passes plain JSON; requests + reviews reuse
// the existing APIs with their existing contracts.
export function MentorsBrowser({ mentors }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [openReview, setOpenReview] = useState(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = mentors;
    if (q) {
      list = list.filter((m) =>
        [m.mentor_name, m.expertise, m.bio, m.primary_domain]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }
    if (filter === "rated") list = list.filter((m) => Number(m.review_count) > 0);
    if (filter === "new") list = list.filter((m) => Number(m.review_count) === 0);
    const sorted = [...list];
    if (sort === "rated") {
      sorted.sort((a, b) => {
        const ar = Number(a.avg_rating) || 0;
        const br = Number(b.avg_rating) || 0;
        if (br !== ar) return br - ar;
        return Number(b.review_count) - Number(a.review_count);
      });
    } else if (sort === "sessions") {
      sorted.sort((a, b) => Number(b.session_count) - Number(a.session_count));
    } else {
      sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return sorted;
  }, [mentors, query, filter, sort]);

  const searching = query.trim().length > 0;

  return (
    <div>
      <div className="mt-6 rounded-[var(--radius-lg)] border p-3" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, skill, domain…"
            aria-label="Find a guide by name, expertise, or topic"
            className="min-w-[200px] flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold"
              style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
            >
              Clear
            </button>
          )}
          <span className="mono-tag hidden sm:inline">Show</span>
          <SegControl options={FILTERS} value={filter} onChange={setFilter} label="Filter guides" />
          <span className="mono-tag hidden sm:inline">Order</span>
          <SegControl options={SORTS} value={sort} onChange={setSort} label="Sort guides" />
        </div>
        <p className="mono-tag mt-2" role="status">
          {searching || filter !== "all" ? `${rows.length} of ${mentors.length} guides` : `${mentors.length} guide${mentors.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 border-t py-10 text-center" style={{ borderColor: "var(--line)" }}>
          <p className="font-display text-2xl font-medium" style={{ color: "var(--text)" }}>
            No guides match “{query.trim()}”.
          </p>
          <p className="narrative mx-auto mt-3 max-w-md text-center">
            {filter !== "all"
              ? "Try clearing the search or showing all guides — new guides join as seniors prove themselves."
              : "Try a broader topic — or browse everyone currently available."}
          </p>
          <button
            type="button"
            onClick={() => { setQuery(""); setFilter("all"); }}
            className="btn-ghost mt-6"
          >
            Clear search
          </button>
        </div>
      ) : (
        <ol className="mt-4 grid gap-4">
          {rows.map((m) => {
            const reviews = Number(m.review_count) || 0;
            const rated = reviews > 0;
            const sessions = Number(m.session_count) || 0;
            const metaBits = [
              m.primary_domain || null,
              m.year ? `Year ${m.year}` : null,
              m.branch || null
            ].filter(Boolean);
            const reviewOpen = openReview === m.user_id;
            return (
              <li key={m.id} className="rounded-xl border p-5 hover:shadow-sm" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <div className="flex gap-4">
                  <span className="hidden sm:grid size-12 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ background: "color-mix(in srgb, var(--accent) 14%, var(--bg-muted))", color: "var(--accent)", boxShadow: "0 0 0 8px var(--accent-glow)" }} aria-hidden="true">{String(m.mentor_name || "?").trim().slice(0,2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      {m.profile_username ? (
                        <Link href={`/student/${m.profile_username}`} prefetch={false} className="font-display text-xl font-medium hover:underline" style={{ color: "var(--text)" }}>{m.mentor_name || "Mentor"}</Link>
                      ) : (
                        <p className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>{m.mentor_name || "Mentor"}</p>
                      )}
                      <span className="meta shrink-0">{rated ? `★ ${Number(m.avg_rating).toFixed(1)} · ${reviews} review${reviews === 1 ? "" : "s"}` : "New guide"}</span>
                    </div>
                <p className="meta mt-2" style={{ color: "var(--accent)" }}>{m.expertise || "General guidance"}</p>
                {metaBits.length > 0 && (
                  <p className="meta mt-1.5">{metaBits.join(" · ")}</p>
                )}
                {m.bio && <p className="narrative mt-2" style={{ color: "var(--text)" }}>{m.bio}</p>}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <MentorRequestButton mentorId={m.user_id} />
                  {sessions > 0 && (
                    <span className="meta">{sessions} session{sessions === 1 ? "" : "s"} guided</span>
                  )}
                  {m.profile_username && (
                    <Link
                      href={`/student/${m.profile_username}`}
                      prefetch={false}
                      className="text-xs font-semibold hover:underline"
                      style={{ color: "var(--accent)" }}
                    >
                      View journey →
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenReview(reviewOpen ? null : m.user_id)}
                    aria-expanded={reviewOpen}
                    aria-controls={`review-${m.user_id}`}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {reviewOpen ? "Close review" : "Leave a review"}
                  </button>
                </div>
                {reviewOpen && (
                  <div id={`review-${m.user_id}`} className="mt-4 max-w-xl">
                    <ReviewForm
                      mentorId={m.user_id}
                      mentorName={m.mentor_name || "this guide"}
                      onSaved={() => {
                        setOpenReview(null);
                        router.refresh();
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="meta mt-5">
        A request notifies the guide — it doesn’t book a slot. You’ll hear back through notifications.
      </p>
    </div>
  );
}

function ReviewForm({ mentorId, mentorName, onSaved }) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/social/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mentorId, rating: Number(rating), reviewText: text })
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "Couldn't save. Try again.");
        setBusy(false);
        return;
      }
      setDone(true);
      onSaved?.();
    } catch {
      setMsg("Couldn't reach the server. Try again.");
      setBusy(false);
    }
  }

  if (done) return <p className="text-xs font-semibold" style={{ color: "var(--accent)" }}>Review saved ✓</p>;

  return (
    <form
      onSubmit={submit}
      aria-label={`Review ${mentorName}`}
      className="rounded-2xl border p-4"
      style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="meta">Rating</span>
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            aria-label={`Rating for ${mentorName}, 1 to 5`}
            className="mt-1.5 rounded-[10px] border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
          >
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} — {n === 5 ? "Excellent" : n === 4 ? "Good" : n === 3 ? "Okay" : n === 2 ? "Weak" : "Poor"}</option>)}
          </select>
        </label>
        <label className="block min-w-52 flex-1">
          <span className="meta">Review (optional)</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder="Clear, patient, practical"
            aria-label={`Written review for ${mentorName}`}
            className="mt-1.5 w-full rounded-[10px] border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
          />
        </label>
        <button type="submit" disabled={busy} className="btn-ink disabled:opacity-50">
          {busy ? "Saving…" : "Save review"}
        </button>
      </div>
      {msg && <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
    </form>
  );
}
