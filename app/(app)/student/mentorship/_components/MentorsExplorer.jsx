"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, Star, SlidersHorizontal, X } from "lucide-react";
import {
  EXPERTISE, SORTS, parseSkills, inr, priceFor,
  matchesExperience, matchesAvailability, availabilityBucket, availabilityLabel, sortMentors,
} from "@/lib/mentors";
import { BookingModal } from "./BookingModal";

function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function MentorsExplorer({ initialMentors, initialAvailability }) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [expertise, setExpertise] = useState("all");
  const [avail, setAvail] = useState("all");
  const [experience, setExperience] = useState("any");
  const [sort, setSort] = useState("recommended");
  const [mentors, setMentors] = useState(initialMentors || []);
  const [availability, setAvailability] = useState(initialAvailability || {});
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Backend search: text + expertise run server-side, the rest client-side.
  useEffect(() => {
    let live = true;
    setLoading(true);
    const params = new URLSearchParams({ q: debouncedQ, expertise });
    fetch(`/api/mentors?${params}`).then((r) => r.json()).then((d) => {
      if (!live) return;
      if (d?.ok) {
        setMentors(d.data.mentors || []);
        setAvailability(d.data.availability || {});
      }
      setLoading(false);
    }).catch(() => live && setLoading(false));
    return () => { live = false; };
  }, [debouncedQ, expertise]);

  const visible = useMemo(() => {
    const withSkills = mentors.map((m) => ({ ...m, skillsList: parseSkills(m.skills, m.expertise) }));
    return sortMentors(
      withSkills.filter((m) => matchesExperience(m, experience) && matchesAvailability(m, avail, availability[m.user_id])),
      sort
    );
  }, [mentors, availability, experience, avail, sort]);

  const hasFilters = q || expertise !== "all" || avail !== "all" || experience !== "any";
  const clear = () => { setQ(""); setExpertise("all"); setAvail("all"); setExperience("any"); setSort("recommended"); };

  const selectCls = "rounded-lg border text-[13px] outline-none";
  const selectStyle = { borderColor: "var(--line)", background: "var(--bg-elevated)", color: "var(--text)", padding: "8px 10px" };

  return (
    <div>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <Search size={15} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search mentors by name, skill or expertise"
              aria-label="Search mentors"
              className="w-full bg-transparent text-sm outline-none"
              style={{ color: "var(--text)" }}
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Clear search" style={{ color: "var(--text-muted)" }}>
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="btn-ghost !px-3.5 sm:hidden"
          >
            <SlidersHorizontal size={15} /> Filters
          </button>
        </div>
        <div className={`${filtersOpen ? "grid" : "hidden"} grid-cols-2 gap-2 sm:grid sm:grid-cols-4`}>
          <select aria-label="Expertise filter" className={selectCls} style={selectStyle} value={expertise} onChange={(e) => setExpertise(e.target.value)}>
            <option value="all">All expertise</option>
            {EXPERTISE.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <select aria-label="Availability filter" className={selectCls} style={selectStyle} value={avail} onChange={(e) => setAvail(e.target.value)}>
            <option value="all">Any availability</option>
            <option value="now">Available Now</option>
            <option value="today">Available Today</option>
            <option value="week">Available This Week</option>
          </select>
          <select aria-label="Experience filter" className={selectCls} style={selectStyle} value={experience} onChange={(e) => setExperience(e.target.value)}>
            <option value="any">Any experience</option>
            <option value="1-3">1–3 years</option>
            <option value="3-5">3–5 years</option>
            <option value="5-10">5–10 years</option>
            <option value="10+">10+ years</option>
          </select>
          <select aria-label="Sort mentors" className={selectCls} style={selectStyle} value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="meta" aria-live="polite">
          {loading ? "Searching…" : `${visible.length} mentor${visible.length === 1 ? "" : "s"}`}
        </p>
        {hasFilters && (
          <button type="button" onClick={clear} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Clear Filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skel" style={{ height: 230 }} />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="mx-auto max-w-xl py-12 text-center">
          <p className="meta" style={{ color: "var(--accent)" }}>No mentors found</p>
          <p className="h-product mt-2">Try changing your search or filters.</p>
          {hasFilters && <button type="button" onClick={clear} className="btn-ghost mt-5">Clear all filters</button>}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => (
            <MentorCard key={m.id} mentor={m} schedule={availability[m.user_id] || []} onSkill={setQ} onBook={() => setBooking(m)} />
          ))}
        </div>
      )}

      {booking && (
        <BookingModal mentor={booking} onClose={() => setBooking(null)} />
      )}
    </div>
  );
}

export function MentorCard({ mentor: m, schedule, onSkill, onBook }) {
  const bucket = availabilityBucket(schedule);
  const price = priceFor(m.hourly_rate, m.session_minutes || 60);
  return (
    <article className="flex flex-col rounded-2xl border p-5 transition hover:shadow-md" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <div className="flex items-start gap-3">
        <span className="relative grid size-12 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: "var(--dash-accent, var(--accent))" }} aria-hidden="true">
          {initials(m.mentor_name)}
          <span
            className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2"
            style={{ background: m.available ? "#22c55e" : "var(--text-muted)", borderColor: "var(--bg-elevated)" }}
            title={m.available ? "Available" : "Paused"}
          />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            {m.mentor_name || "Mentor"}
            {m.is_verified && <span className="ml-1.5 text-[11px] font-bold" style={{ color: "var(--accent)" }} title="Verified mentor">✓</span>}
          </h3>
          <p className="truncate text-[12.5px]" style={{ color: "var(--text-muted)" }}>{m.headline || m.expertise || "General guidance"}</p>
        </div>
      </div>

      {m.bio && <p className="mt-3 line-clamp-2 text-[13px] leading-5" style={{ color: "var(--text-muted)" }}>{m.bio}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {parseSkills(m.skills, m.expertise).slice(0, 4).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSkill && onSkill(s)}
            title={`Filter by ${s}`}
            className="rounded-full border px-2 py-0.5 text-[11px] font-medium transition hover:underline"
            style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
        {m.experience_years != null && <span>{m.experience_years} yrs experience</span>}
        {Number(m.review_count) > 0 ? (
          <Link href={`/student/mentorship/${m.user_id}#reviews`} prefetch={false} className="inline-flex items-center gap-1 font-semibold hover:underline" style={{ color: "var(--text)" }}>
            <Star size={12} fill="var(--accent)" strokeWidth={0} aria-hidden="true" />
            {Number(m.avg_rating).toFixed(1)} <span className="font-normal" style={{ color: "var(--text-muted)" }}>({m.review_count})</span>
          </Link>
        ) : (
          <span>New mentor</span>
        )}
        <span style={{ color: bucket === "none" ? "var(--text-muted)" : "#15803d" }}>{m.available ? availabilityLabel(bucket) : "Paused"}</span>
      </div>

      <div className="mt-2 text-[12.5px] font-semibold" style={{ color: "var(--text)" }}>
        {price != null ? `${inr(price)} / session` : "Free sessions"}
      </div>

      <div className="mt-4 flex gap-2">
        <Link href={`/student/mentorship/${m.user_id}`} prefetch={false} className="btn-ghost flex-1 justify-center !py-2 text-[13px]">
          View Profile
        </Link>
        <button type="button" onClick={onBook} className="btn-ink flex-1 justify-center !py-2 text-[13px]">
          Book Session
        </button>
      </div>
    </article>
  );
}
