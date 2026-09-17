"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { parseSkills, inr, priceFor, availabilityLabel, availabilityBucket } from "@/lib/mentors";
import { BookingModal } from "../../_components/BookingModal";
import { MessageThread } from "../../_components/MessageThread";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ProfileClient({ mentor, availability, reviews, canReview, isSelf }) {
  const [bookingOpen, setBookingOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [reviewMsg, setReviewMsg] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [localReviews, setLocalReviews] = useState(reviews || []);

  const bucket = availabilityBucket(availability);
  const price = priceFor(mentor.hourly_rate, mentor.session_minutes || 60);
  const byDay = DAYS.map((label, d) => ({
    label,
    rows: (availability || []).filter((a) => Number(a.day_of_week) === d),
  }));

  async function submitReview(e) {
    e.preventDefault();
    setReviewBusy(true);
    setReviewMsg("");
    try {
      const res = await fetch(`/api/mentors/${mentor.user_id}/reviews`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, text: text.trim() }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error?.message || "Review failed");
      setLocalReviews((r) => [d.data.review, ...r]);
      setText("");
      setReviewMsg("Thanks — your review is live.");
    } catch (err) {
      setReviewMsg(err.message);
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {!isSelf && (
          <>
            <button type="button" onClick={() => setBookingOpen(true)} className="btn-ink">Book a Session</button>
            <button type="button" onClick={() => setChatOpen((v) => !v)} aria-expanded={chatOpen} className="btn-ghost">
              {chatOpen ? "Hide Messages" : "Message Mentor"}
            </button>
          </>
        )}
      </div>
      {chatOpen && !isSelf && (
        <div className="mt-4 max-w-xl">
          <MessageThread mentorUserId={mentor.user_id} />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="About">
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>About</h2>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              {mentor.bio || "This mentor hasn't written a bio yet."}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              {mentor.experience_years != null && <span><strong style={{ color: "var(--text)" }}>{mentor.experience_years} years</strong> experience</span>}
              {mentor.branch && <span>{mentor.branch}{mentor.year ? ` · Year ${mentor.year}` : ""}</span>}
              {mentor.timezone && <span>{mentor.timezone}</span>}
              {(mentor.languages || "").trim() && <span>Speaks {(mentor.languages || "").split(",").map((s) => s.trim()).filter(Boolean).join(", ")}</span>}
              <span>{mentor.session_count || 0} sessions guided</span>
            </div>
          </section>

          <section className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Expertise">
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Expertise</h2>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {parseSkills(mentor.skills, mentor.expertise).map((s) => (
                <span key={s} className="rounded-full border px-2.5 py-1 text-[12px] font-medium" style={{ borderColor: "var(--line)", color: "var(--text)" }}>
                  {s}
                </span>
              ))}
              {parseSkills(mentor.skills, mentor.expertise).length === 0 && (
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>General guidance</span>
              )}
            </div>
          </section>

          <section className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Availability">
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Availability</h2>
            {(availability || []).length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>This mentor hasn&apos;t published weekly hours yet.</p>
            ) : (
              <dl className="mt-2 space-y-1.5 text-[13px]">
                {byDay.map((d) => (
                  <div key={d.label} className="flex gap-3">
                    <dt className="w-24 shrink-0 font-medium" style={{ color: "var(--text-muted)" }}>{d.label}</dt>
                    <dd style={{ color: "var(--text)" }}>
                      {d.rows.length === 0 ? <span style={{ color: "var(--text-muted)" }}>Unavailable</span> : d.rows.map((r) => `${r.start_time}–${r.end_time}`).join(", ")}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
              Sessions run {mentor.session_minutes || 60} minutes{price != null ? ` · ${inr(price)} per session` : " · free"}.
            </p>
          </section>

          <section id="reviews" className="scroll-mt-24 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Reviews">
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              Reviews {localReviews.length > 0 && <span style={{ color: "var(--text-muted)" }}>· {localReviews.length}</span>}
            </h2>
            {localReviews.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No reviews yet — be the first after a completed session.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {localReviews.map((r) => (
                  <li key={r.id} className="border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: "var(--line)" }}>
                    <div className="flex items-center gap-2 text-[12.5px]">
                      <span className="font-semibold" style={{ color: "var(--text)" }}>{r.reviewer_name || "Student"}</span>
                      <span className="inline-flex items-center gap-0.5" aria-label={`${r.rating} out of 5 stars`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={11} fill={i < r.rating ? "var(--accent)" : "none"} strokeWidth={1.5} style={{ color: "var(--accent)" }} aria-hidden="true" />
                        ))}
                      </span>
                      <span style={{ color: "var(--text-muted)" }} suppressHydrationWarning>
                        {r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) : ""}
                      </span>
                    </div>
                    {r.review_text && <p className="mt-1 text-[13px] leading-5" style={{ color: "var(--text-muted)" }}>{r.review_text}</p>}
                  </li>
                ))}
              </ul>
            )}
            {canReview && !isSelf && (
              <form onSubmit={submitReview} className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Leave a review</p>
                <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className="p-0.5">
                      <Star size={20} fill={n <= rating ? "var(--accent)" : "none"} strokeWidth={1.5} style={{ color: "var(--accent)" }} />
                    </button>
                  ))}
                </div>
                <textarea
                  value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000}
                  placeholder="What did this mentor help you with?"
                  aria-label="Review text"
                  className="mt-2 w-full rounded-xl border px-3 py-2 text-[13px] outline-none"
                  style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
                />
                <div className="mt-2 flex items-center gap-3">
                  <button type="submit" disabled={reviewBusy} className="btn-ink !py-2 text-[13px] disabled:opacity-50">
                    {reviewBusy ? "Posting…" : "Post review"}
                  </button>
                  {reviewMsg && <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>{reviewMsg}</span>}
                </div>
              </form>
            )}
          </section>
        </div>

        <aside className="h-fit rounded-2xl border p-5 lg:sticky lg:top-24" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Session summary">
          <p className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: availabilityBucket(availability) === "none" ? "var(--text-muted)" : "#15803d" }}>
            {mentor.available ? availabilityLabel(bucket) : "Currently paused"}
          </p>
          <p className="mt-2 text-[22px] font-bold" style={{ color: "var(--text)" }}>
            {price != null ? inr(price) : "Free"}
          </p>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>per {mentor.session_minutes || 60}-minute session</p>
          {!isSelf && (
            <button type="button" onClick={() => setBookingOpen(true)} className="btn-ink mt-4 w-full justify-center">
              Book a Session
            </button>
          )}
          <dl className="mt-4 space-y-1.5 border-t pt-3 text-[12.5px]" style={{ borderColor: "var(--line)" }}>
            <div className="flex justify-between"><dt style={{ color: "var(--text-muted)" }}>Mentoring since</dt><dd style={{ color: "var(--text)" }} suppressHydrationWarning>{mentor.created_at ? new Date(mentor.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}</dd></div>
            <div className="flex justify-between"><dt style={{ color: "var(--text-muted)" }}>Sessions</dt><dd style={{ color: "var(--text)" }}>{mentor.session_count || 0}</dd></div>
            <div className="flex justify-between"><dt style={{ color: "var(--text-muted)" }}>Rating</dt><dd style={{ color: "var(--text)" }}>{Number(mentor.avg_rating || 0) > 0 ? `${Number(mentor.avg_rating).toFixed(1)} (${mentor.review_count})` : "—"}</dd></div>
          </dl>
        </aside>
      </div>

      {bookingOpen && <BookingModal mentor={mentor} onClose={() => setBookingOpen(false)} />}
    </div>
  );
}
