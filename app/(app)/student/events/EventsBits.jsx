"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";

export function RegisterButton({ eventId, registered, full }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action) {
    setBusy(true);
    await fetch(`/api/events/${eventId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action })
    });
    setBusy(false);
    router.refresh();
  }

  if (registered) {
    return <button disabled={busy} onClick={() => act("cancel")} className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>Registered ✓ (cancel)</button>;
  }
  return (
    <button disabled={busy || full} onClick={() => act("register")} className="btn-ink disabled:opacity-50">
      {busy ? "…" : full ? "Full" : "Register"}
    </button>
  );
}

export function FeedbackForm({ eventId }) {
  const router = useRouter();
  const [score, setScore] = useState(5);
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedbackScore: Number(score), feedbackText: text || null })
    });
    if ((await res.json()).ok) {
      setDone(true);
      router.refresh();
    }
  }

  if (done) return <p className="text-sm" style={{ color: "var(--accent)" }}>Thanks for the feedback ✓</p>;
  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
      <Field label="Rating">
        <select value={score} onChange={(e) => setScore(e.target.value)} style={inputStyle}>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      <Field label="Feedback (optional)">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="What worked?" style={{ ...inputStyle, minWidth: 220 }} />
      </Field>
      <button className="btn-ink">Send</button>
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
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
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
      {msg && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{msg}</p>}
    </form>
  );
}
