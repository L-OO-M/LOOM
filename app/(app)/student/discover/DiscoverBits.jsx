"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";

export function ClaimCard({ hasCard }) {
  if (hasCard) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-dashed px-4 py-3" style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, var(--line))", background: "var(--wash)" }}>
      <span className="text-sm" style={{ color: "var(--text)" }}><span className="meta mr-2" style={{ color: "var(--accent)" }}>Discover</span>Claim your builder card to appear in Discover — <span style={{ color: "var(--text-muted)" }}>pick a username and share proof.</span></span>
      <span className="flex items-center gap-2"><UsernameForm compact /></span>
    </div>
  );
}

function UsernameForm({ compact = false }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/social/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, bio: "" })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    router.push(`/student/${data.data.card.username}`);
    router.refresh();
  }

  if (compact) {
    return (
      <form onSubmit={submit} className="flex items-center gap-2">
        <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={2} maxLength={30} placeholder="aanya-dev" aria-label="Username" style={{ ...inputStyle, minWidth: 140, padding: "7px 10px" }} />
        <button disabled={busy} className="btn-ink !px-3 !py-1.5 text-xs disabled:opacity-50">{busy ? "…" : "Claim"}</button>
        {msg && <span className="text-xs" style={{ color: "var(--danger)" }}>{msg}</span>}
      </form>
    );
  }
  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
      <Field label="Username">
        <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={2} maxLength={30} placeholder="aanya-dev" style={{ ...inputStyle, minWidth: 160 }} />
      </Field>
      <button disabled={busy} className="btn-ink disabled:opacity-50">{busy ? "…" : "Claim"}</button>
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
    </form>
  );
}

export function MentorReviewForm({ mentorId }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const res = await fetch("/api/social/discover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mentorId, rating: Number(rating), reviewText: text })
    });
    if ((await res.json()).ok) {
      setDone(true);
      router.refresh();
    }
  }

  if (done) return <p className="text-xs" style={{ color: "var(--accent)" }}>Review saved ✓</p>;
  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
      <Field label="Rate">
        <select value={rating} onChange={(e) => setRating(e.target.value)} style={inputStyle}>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      <Field label="Review (optional)">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Clear, patient, practical" style={{ ...inputStyle, minWidth: 160 }} />
      </Field>
      <button className="btn-ink">Review</button>
    </form>
  );
}
