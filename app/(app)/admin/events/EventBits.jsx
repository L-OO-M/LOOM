"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";

export function EventForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("workshop");
  const [domain, setDomain] = useState("general");
  const [speakerName, setSpeakerName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title, description, eventType, domain,
        speakerName: speakerName || null,
        startsAt: new Date(startsAt).toISOString(),
        location: location || null,
        capacity: capacity ? Number(capacity) : null
      })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    router.push(`/student/events/${data.data.event.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={160} style={inputStyle} /></Field></div>
      <div className="sm:col-span-2"><Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={4000} style={inputStyle} /></Field></div>
      <Field label="Type">
        <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={inputStyle}>
          <option value="workshop">Workshop</option>
          <option value="hackathon">Hackathon</option>
          <option value="talk">Talk</option>
          <option value="mentoring">Mentoring</option>
          <option value="contest">Contest</option>
        </select>
      </Field>
      <Field label="Domain"><input value={domain} onChange={(e) => setDomain(e.target.value)} style={inputStyle} /></Field>
      <Field label="Speaker (optional)"><input value={speakerName} onChange={(e) => setSpeakerName(e.target.value)} maxLength={120} style={inputStyle} /></Field>
      <Field label="Starts at"><input value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required type="datetime-local" style={inputStyle} /></Field>
      <Field label="Location (optional)"><input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} placeholder="Room 201 / Zoom link" style={inputStyle} /></Field>
      <Field label="Capacity (optional)"><input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" min={0} placeholder="Unlimited" style={inputStyle} /></Field>
      <div className="sm:col-span-2">
        {msg && <p className="mb-2 text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
        <button disabled={busy} className="btn-ink disabled:opacity-50">{busy ? "Creating…" : "Create event"}</button>
      </div>
    </form>
  );
}
