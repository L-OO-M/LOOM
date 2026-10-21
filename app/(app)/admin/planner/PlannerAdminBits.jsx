"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputStyle } from "@/components/ui";

export function PlannerAdminForm({ weeks }) {
  const router = useRouter();
  const [week, setWeek] = useState(weeks[0]?.week_number ?? 1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("talk");
  const [kind, setKind] = useState("society");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/planner", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        week: Number(week),
        title,
        description,
        eventType,
        kind,
        location: location || null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed to schedule");
      return;
    }
    setTitle("");
    setDescription("");
    setLocation("");
    setStartsAt("");
    setEndsAt("");
    setMsg("Scheduled.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Field label="Planner week">
        <select value={week} onChange={(e) => setWeek(e.target.value)} style={inputStyle}>
          {weeks.map((w) => (
            <option key={w.id} value={w.week_number}>
              W{String(w.week_number).padStart(2, "0")} · {w.starts_on}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={160} style={inputStyle} />
      </Field>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={4000} style={inputStyle} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={inputStyle}>
            <option value="talk">Talk</option>
            <option value="workshop">Workshop</option>
            <option value="hackathon">Hackathon</option>
            <option value="contest">Contest</option>
            <option value="mentoring">Mentoring</option>
          </select>
        </Field>
        <Field label="Kind">
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle}>
            <option value="society">Society</option>
            <option value="kickoff">Kickoff</option>
            <option value="hackathon">Hackathon</option>
            <option value="ctf">CTF</option>
            <option value="opendrive">Open-source drive</option>
            <option value="showcase">Showcase</option>
            <option value="assessment">Assessment</option>
          </select>
        </Field>
      </div>
      <Field label="Starts at (IST)">
        <input value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required type="datetime-local" style={inputStyle} />
      </Field>
      <Field label="Ends at (optional)">
        <input value={endsAt} onChange={(e) => setEndsAt(e.target.value)} type="datetime-local" style={inputStyle} />
      </Field>
      <Field label="Location (optional)">
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} style={inputStyle} />
      </Field>
      {msg ? (
        <p className="text-xs" style={{ color: msg === "Scheduled." ? "var(--text-muted)" : "var(--danger)" }}>{msg}</p>
      ) : null}
      <button disabled={busy} className="btn-ink disabled:opacity-50">{busy ? "Scheduling…" : "Schedule event"}</button>
    </form>
  );
}
