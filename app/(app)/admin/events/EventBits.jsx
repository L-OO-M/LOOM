"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";

// The create form used to ask for a free-text "Domain", send no end time, no
// online flag and no speaker bio -- so the event page rendered half a record and
// the admin had to open the editor immediately after creating it. Everything the
// events table stores is collected here once, in the order the page shows it.
export function EventForm({ domains = [], departments = [] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("workshop");
  const [domain, setDomain] = useState("general");
  const [departmentId, setDepartmentId] = useState("");
  const [speakerName, setSpeakerName] = useState("");
  const [speakerBio, setSpeakerBio] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [isOnline, setIsOnline] = useState(false);
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
        title,
        description,
        eventType,
        domain,
        speakerName: speakerName || null,
        speakerBio: speakerBio || null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        location: location || null,
        capacity: capacity ? Number(capacity) : null,
        isOnline,
        scope: departmentId ? "department" : "society",
        departmentId: departmentId || null
      })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    router.push(`/admin/events/${data.data.event.id}`);
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
      <Field label="Track">
        <select value={domain} onChange={(e) => setDomain(e.target.value)} style={inputStyle}>
          <option value="general">General / chapter-wide</option>
          {domains.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      </Field>
      {departments.length > 0 && (
        <Field label="Department (optional)">
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={inputStyle}>
            <option value="">Society-wide</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Speaker (optional)"><input value={speakerName} onChange={(e) => setSpeakerName(e.target.value)} maxLength={120} style={inputStyle} /></Field>
      <div className="sm:col-span-2"><Field label="Speaker bio (optional)"><textarea value={speakerBio} onChange={(e) => setSpeakerBio(e.target.value)} rows={2} maxLength={1000} style={inputStyle} /></Field></div>
      <Field label="Starts at"><input value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required type="datetime-local" style={inputStyle} /></Field>
      <Field label="Ends at (optional)"><input value={endsAt} onChange={(e) => setEndsAt(e.target.value)} type="datetime-local" style={inputStyle} /></Field>
      <Field label="Location (optional)"><input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} placeholder="Room 201 / meeting link" style={inputStyle} /></Field>
      <Field label="Capacity (optional)"><input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" min={0} placeholder="Unlimited" style={inputStyle} /></Field>
      <label className="inline-flex items-center gap-2 text-xs sm:col-span-2" style={{ color: "var(--text-muted)" }}>
        <input type="checkbox" checked={isOnline} onChange={(e) => setIsOnline(e.target.checked)} />
        Online event
      </label>
      <div className="sm:col-span-2">
        {msg && <p className="mb-2 text-xs" role="alert" style={{ color: "var(--danger)" }}>{msg}</p>}
        <button disabled={busy} className="btn-ink disabled:opacity-50">{busy ? "Creating…" : "Create event"}</button>
      </div>
    </form>
  );
}
