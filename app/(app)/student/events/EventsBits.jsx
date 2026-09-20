"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";
import { Meta, StatusPill, ActionLink } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";
import {
  EVENT_TYPES,
  TYPE_LABEL,
  displayState,
  isFull,
  filterEvents,
  collectDomains,
  nextStepFor
} from "@/lib/events";

function formatDay(iso) {
  return new Date(iso).getDate();
}

function formatMonth(iso) {
  return new Date(iso).toLocaleDateString("en-IN", { month: "short" });
}

function formatWeekday(iso) {
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short" });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function formatLong(iso) {
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "long", month: "short", day: "numeric" });
}

export function RegisterButton({ eventId, registered, full }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        if (res.status === 409) setError("Registration is full.");
        else if (res.status === 401) setError("Your session has expired. Sign in again.");
        else if (action === "cancel" && data?.ok === false) setError("Couldn't cancel your registration. Try again.");
        else setError("Couldn't update your registration. Try again.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Couldn't update your registration. Try again.");
    }
    setBusy(false);
  }

  if (registered) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill tone="live">You're in ✓</StatusPill>
        <button
          type="button"
          disabled={busy}
          onClick={() => act("cancel")}
          className="text-sm underline-offset-2 hover:underline disabled:opacity-50"
          style={{ color: "var(--text-muted)" }}
        >
          {busy ? "Cancelling…" : "Cancel registration"}
        </button>
        {error && (
          <p role="alert" className="w-full text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={busy || full}
        onClick={() => act("register")}
        className="btn-ink disabled:opacity-50"
      >
        {busy ? "Reserving…" : full ? "Full" : "Register"}
      </button>
      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export function FeedbackForm({ eventId }) {
  const router = useRouter();
  const [score, setScore] = useState(5);
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feedbackScore: Number(score), feedbackText: text || null })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        if (res.status === 401) setError("Your session has expired. Sign in again.");
        else setError("Couldn't save your feedback. Try again.");
      } else {
        setDone(true);
        router.refresh();
      }
    } catch {
      setError("Couldn't save your feedback. Try again.");
    }
    setBusy(false);
  }

  if (done) return <p className="text-sm" style={{ color: "var(--accent)" }}>Thanks for the feedback ✓</p>;
  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
      <Field label="Rating">
        <select value={score} onChange={(e) => setScore(e.target.value)} style={inputStyle} aria-label="Rating out of 5">
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      <Field label="Feedback (optional)">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="What worked?" style={{ ...inputStyle, minWidth: 220 }} />
      </Field>
      <button className="btn-ink disabled:opacity-50" disabled={busy}>{busy ? "Sending…" : "Send"}</button>
      {error && (
        <p role="alert" className="w-full text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </form>
  );
}

export function MaterialForm({ eventId }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    const res = await fetch(`/api/events/${eventId}/materials`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, storageUrl: url, fileType: "link" })
    });
    const data = await res.json();
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setTitle("");
    setUrl("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
      <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} style={{ ...inputStyle, minWidth: 160 }} /></Field>
      <Field label="URL"><input value={url} onChange={(e) => setUrl(e.target.value)} required type="url" placeholder="https://…" style={{ ...inputStyle, minWidth: 220 }} /></Field>
      <button className="btn-ink">Add</button>
      {msg && <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
    </form>
  );
}

export function CheckInForm({ eventId }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    setMsg("Checking in…");
    const res = await fetch(`/api/admin/events/${eventId}/attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checkInCode: code.trim().toUpperCase() })
    });
    const data = await res.json();
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setCode("");
    setMsg(`Checked in ✓ certificate ${data.data.certificate.verification_code}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
      <Field label="Door code (e.g. LOOM-AB12CD34)">
        <input value={code} onChange={(e) => setCode(e.target.value)} required minLength={4} maxLength={20} style={{ ...inputStyle, minWidth: 200 }} />
      </Field>
      <button className="btn-ink">Check in</button>
      {msg && <p role="status" className="text-xs" style={{ color: "var(--text-muted)" }}>{msg}</p>}
    </form>
  );
}

/* Scope tabs — link-based segmented control, same .seg language as the page. */
function ScopeTabs({ scope }) {
  const tabs = [
    { value: "upcoming", label: "Upcoming", href: "/student/events" },
    { value: "registered", label: "Registered", href: "/student/events?scope=registered" },
    { value: "past", label: "Past", href: "/student/events?scope=past" }
  ];
  return (
    <div className="seg mt-7" role="group" aria-label="Event scope">
      {tabs.map((t) => {
        const active = scope === t.value;
        return (
          <Link
            key={t.value}
            href={t.href}
            prefetch={false}
            aria-pressed={active ? "true" : "false"}
            className={active ? "!bg-[var(--text)] !text-[var(--bg)] rounded-full px-4 py-1.5 text-sm font-semibold" : "rounded-full px-4 py-1.5 text-sm font-semibold"}
            style={active ? undefined : { color: "var(--text-muted)" }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

function EventRow({ e, mine, showAction }) {
  const state = displayState(e, mine);
  const full = isFull(e, mine);
  const step = nextStepFor(e);
  const pct = e.capacity ? Math.min(100, Math.round((e.seats_taken / e.capacity) * 100)) : null;
  return (
    <li className="rounded-xl border bg-[var(--bg-elevated)] p-5 transition hover:shadow-sm sm:p-6" style={{ borderColor: "var(--line)" }}>
      <div className="flex gap-5">
        <div className="w-14 shrink-0 text-center" aria-hidden="true">
          <p className="figure text-3xl">{formatDay(e.starts_at)}</p>
          <p className="mono-tag mt-1">{formatMonth(e.starts_at)}</p>
          <p className="mono-tag">{formatWeekday(e.starts_at)}</p>
          {pct !== null && (
            <div className="mx-auto mt-3 h-1.5 w-10 overflow-hidden rounded-full" style={{ background: "var(--bg-muted)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? "var(--danger)" : pct >= 70 ? "var(--warn)" : "var(--accent)" }} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href={`/student/events/${e.id}`} prefetch={false} className="font-display text-lg font-medium hover:underline" style={{ color: "var(--text)" }}>{e.title}</Link>
            {(state.key === "in" || state.key === "attended") && <StatusPill tone="live">{state.label}</StatusPill>}
            {state.key === "full" && <StatusPill>{state.label}</StatusPill>}
            {state.key === "live" && <StatusPill tone="live">{state.label}</StatusPill>}
          </div>
          <p className="mono-tag mt-1.5">
            {TYPE_LABEL[e.event_type] || e.event_type}
            {e.domain && e.domain !== "general" ? <span className="dot-sep">{e.domain}</span> : ""}
            <span className="dot-sep">{formatTime(e.starts_at)}</span>
            {e.is_online ? <span className="dot-sep">online</span> : e.location ? <span className="dot-sep">{e.location}</span> : ""}
            {e.capacity ? <span className="dot-sep">{e.seats_taken}/{e.capacity} seats · {pct}% filled</span> : ""}
          </p>
          {e.speaker_name && <p className="mt-2 flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}><span className="size-6 rounded-full bg-[var(--bg-muted)] grid place-items-center text-[10px] font-bold" style={{ color: "var(--text)" }}>{e.speaker_name.slice(0,2).toUpperCase()}</span>with {e.speaker_name}</p>}
          {step && (
            <Link href={step.href} prefetch={false} className="mono-tag mt-2 inline-block hover:underline" style={{ color: "var(--accent)" }}>
              {step.label} →
            </Link>
          )}
          {showAction && (
            <div className="mt-4"><RegisterButton eventId={e.id} registered={!!mine} full={full && !mine} /></div>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * EventsExplorer — client island for scope-aware browsing over the rows the
 * server already fetched. Type/domain filters are in-memory; no new queries.
 */
export function EventsExplorer({ events, seats, certByEvent, scope, showActions }) {
  const [type, setType] = useState("all");
  const [domain, setDomain] = useState("all");
  const domains = useMemo(() => collectDomains(events), [events]);
  const visible = useMemo(() => filterEvents(events, { type, domain }), [events, type, domain]);
  const mineByEvent = useMemo(() => {
    const map = new Map();
    for (const e of events || []) {
      if (e.registered) map.set(e.id, { status: e.reg_status || "registered" });
    }
    return map;
  }, [events]);
  const filtering = type !== "all" || domain !== "all";

  const emptyCopy =
    scope === "past"
      ? { eyebrow: "Archive", title: "No history yet.", why: "Past gatherings will archive here with their materials." }
      : scope === "registered"
        ? { eyebrow: "Your seats", title: "No registrations yet.", why: "When you register for a gathering, it lives here with its door code." }
        : { eyebrow: "Calendar", title: "Nothing scheduled.", why: "Check back soon — or propose a workshop to your chapter admin. The best events start as someone's idea." };

  return (
    <>
      <ScopeTabs scope={scope} />

      {seats.length > 0 && scope === "upcoming" && (
        <section className="mt-8 border-y py-5" style={{ borderColor: "var(--line)" }} aria-label="Your seats">
          <Meta style={{ color: "var(--accent)" }}>You're in · {seats.length}</Meta>
          <ul className="mt-3 space-y-3">
            {seats.map((r) => {
              const cert = certByEvent?.[r.event_id];
              return (
                <li key={r.event_id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="min-w-0">
                    <Link href={`/student/events/${r.event_id}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>{r.title}</Link>
                    <span className="meta ml-2">{formatLong(r.starts_at)} · {formatTime(r.starts_at)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {r.reg_status === "attended" ? (
                      <span className="font-mono text-xs" style={{ color: "var(--accent)" }}>attended ✓</span>
                    ) : (
                      <span className="font-mono text-xs" style={{ color: "var(--accent)" }}>door code {r.check_in_code}</span>
                    )}
                    {cert && (
                      <Link href={`/student/certificates/${cert}`} prefetch={false} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                        View certificate →
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="meta mt-3">
            Participation counts toward your standing.{" "}
            <Link href="/student/leaderboard" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
              See your standing →
            </Link>
          </p>
        </section>
      )}

      {events.length > 0 && (
        <div className="mt-7 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border p-1.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="seg !m-0 flex flex-wrap gap-1 border-0 bg-transparent p-0" role="group" aria-label="Filter by event type">
            {["all", ...EVENT_TYPES].map((t) => {
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active ? "true" : "false"}
                  onClick={() => setType(t)}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98]"
                  style={active ? { background: "var(--text)", color: "var(--bg)" } : { color: "var(--text-muted)", border: "1px solid var(--line)", background: "transparent" }}
                >
                  {t === "all" ? "All" : TYPE_LABEL[t]}
                </button>
              );
            })}
          </div>
          {domains.length > 1 && (
            <span className="ml-auto flex items-center gap-2">
              <span className="mono-tag">Domain</span>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                aria-label="Filter by domain"
                className="rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ color: "var(--text)", border: "1px solid var(--line)", background: "var(--bg-muted)" }}
              >
                <option value="all">All domains</option>
                {domains.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </span>
          )}
        </div>
      )}

      {events.length === 0 ? (
        <OnboardingState eyebrow={emptyCopy.eyebrow} title={emptyCopy.title} why={emptyCopy.why} />
      ) : visible.length === 0 ? (
        <div className="py-10 text-center">
          <p className="meta" style={{ color: "var(--accent)" }}>Filters</p>
          <p className="h-product mt-3" style={{ color: "var(--text)" }}>Nothing matches those filters.</p>
          <p className="narrative mx-auto mt-3 text-center">Try a different type or domain — nothing was removed, just hidden.</p>
          <button
            type="button"
            onClick={() => { setType("all"); setDomain("all"); }}
            className="btn-ghost mt-6"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {filtering && (
            <p className="meta mt-6" role="status">
              Showing {visible.length} of {events.length} gatherings
            </p>
          )}
          <ol className="mt-4 grid gap-4">
            {visible.map((e) => (
              <EventRow key={e.id} e={e} mine={mineByEvent.get(e.id) || null} showAction={showActions} />
            ))}
          </ol>
        </>
      )}
    </>
  );
}
