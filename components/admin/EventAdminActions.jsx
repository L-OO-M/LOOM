"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputStyle } from "@/components/ui";

// The values the events table actually stores (see events_status_check). "past"
// is what the UI calls Completed: writing "completed" used to fail the CHECK
// constraint and 500 the request.
const STATUSES = [
  { value: "upcoming", label: "Upcoming" },
  { value: "live", label: "Live now" },
  { value: "past", label: "Completed" },
  { value: "cancelled", label: "Cancelled" }
];

const EVENT_TYPES = [
  { value: "workshop", label: "Workshop" },
  { value: "hackathon", label: "Hackathon" },
  { value: "talk", label: "Talk" },
  { value: "mentoring", label: "Mentoring" },
  { value: "contest", label: "Contest" }
];

const STATUS_ALIASES = { completed: "past" };

function toLocalInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Admin/lead event workspace actions: approve or reject proposals, move an
// approved event through its lifecycle, and edit every detail students see.
// Approval reuses /api/events/:id/approve (the existing vertical-lead queue);
// edits go through the tenant-checked admin event route.
//
// Editing is available for proposals too: a queue item usually needs a date or
// a venue fixed BEFORE it is approved, and the previous build hid the editor
// until approval, forcing approve → edit → re-open the page.
export function EventAdminActions({ event, departments = [], domains = [] }) {
  const router = useRouter();
  const storedStatus = STATUS_ALIASES[event.status] || event.status || "upcoming";
  const [status, setStatus] = useState(storedStatus);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: event.title || "",
    description: event.description || "",
    eventType: event.event_type || "workshop",
    domain: event.domain || "general",
    startsAt: toLocalInput(event.starts_at),
    endsAt: toLocalInput(event.ends_at),
    location: event.location || "",
    capacity: event.capacity ?? "",
    speakerName: event.speaker_name || "",
    speakerBio: event.speaker_bio || "",
    departmentId: event.department_id || "",
    isOnline: !!event.is_online
  });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [field, setField] = useState(null);

  async function call(url, method, body) {
    setBusy(method + url);
    setMessage("");
    setError("");
    setField(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Could not save the change.");
        setField(data.error?.details?.field || null);
        return false;
      }
      setMessage("Saved.");
      router.refresh();
      return true;
    } catch {
      setError("Network error - nothing was saved.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function approve(approve) {
    const ok = await call(`/api/events/${event.id}/approve`, "POST", { approve });
    if (ok && approve) setStatus("upcoming");
    if (ok && !approve) setStatus("cancelled");
  }

  async function saveStatus(next) {
    setStatus(next);
    await call(`/api/admin/events/${event.id}`, "PATCH", { status: next });
  }

  async function saveDetails(e) {
    e.preventDefault();
    const ok = await call(`/api/admin/events/${event.id}`, "PATCH", {
      title: form.title,
      description: form.description,
      eventType: form.eventType,
      domain: form.domain,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      location: form.location || null,
      capacity: form.capacity === "" ? null : Number(form.capacity),
      speakerName: form.speakerName || null,
      speakerBio: form.speakerBio || null,
      departmentId: form.departmentId || null,
      isOnline: form.isOnline
    });
    if (ok) setEditing(false);
  }

  const isProposed = event.status === "proposed";

  return (
    <div className="mt-4 grid gap-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Workspace actions</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Approve proposals, move the event through its lifecycle, or edit the public details.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isProposed && (
            <>
              <button type="button" onClick={() => approve(true)} disabled={!!busy} className="btn-ink !py-2 text-xs disabled:opacity-50">
                {busy ? "Working…" : "Approve + publish"}
              </button>
              <button type="button" onClick={() => approve(false)} disabled={!!busy} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
                Reject
              </button>
            </>
          )}
          {!isProposed && (
            <label className="text-xs" style={{ color: "var(--text-muted)" }}>
              Status
              <select
                value={status}
                onChange={(e) => saveStatus(e.target.value)}
                disabled={!!busy}
                aria-label="Event status"
                className="aled-select ml-2"
                style={{ padding: "0.3rem 0.4rem" }}
              >
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          )}
          <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--line)", color: "var(--text)" }}>
            {editing ? "Close editor" : "Edit details"}
          </button>
        </div>
      </div>

      {message && <p role="status" className="text-xs" style={{ color: "var(--accent)" }}>{message}</p>}
      {error && <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}

      {editing && (
        <form onSubmit={saveDetails} className="grid gap-3 border-t pt-4 sm:grid-cols-2" style={{ borderColor: "var(--line)" }}>
          <div className="sm:col-span-2"><Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} maxLength={160} style={inputStyle} /></Field></div>
          <div className="sm:col-span-2"><Field label="Description"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} maxLength={4000} style={inputStyle} /></Field></div>
          <Field label="Type">
            <select value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })} style={inputStyle}>
              {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Track">
            <select value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} style={inputStyle}>
              <option value="general">General / chapter-wide</option>
              {domains.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </Field>
          <Field label="Department">
            <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} style={inputStyle}>
              <option value="">No department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Speaker"><input value={form.speakerName} onChange={(e) => setForm({ ...form, speakerName: e.target.value })} maxLength={120} style={inputStyle} /></Field>
          <div className="sm:col-span-2"><Field label="Speaker bio"><textarea value={form.speakerBio} onChange={(e) => setForm({ ...form, speakerBio: e.target.value })} rows={2} maxLength={1000} style={inputStyle} /></Field></div>
          <Field label="Starts at"><input value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} type="datetime-local" style={inputStyle} /></Field>
          <Field label="Ends at">
            <input
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              type="datetime-local"
              aria-invalid={field === "endsAt" || undefined}
              style={inputStyle}
            />
          </Field>
          <Field label="Location"><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={300} placeholder="Room 201 / meeting link" style={inputStyle} /></Field>
          <Field label="Capacity"><input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} type="number" min={0} style={inputStyle} /></Field>
          <label className="inline-flex items-center gap-2 text-xs sm:col-span-2" style={{ color: "var(--text-muted)" }}>
            <input type="checkbox" checked={form.isOnline} onChange={(e) => setForm({ ...form, isOnline: e.target.checked })} />
            Online event
          </label>
          <div className="sm:col-span-2">
            <button disabled={!!busy} className="btn-ink !py-2 text-xs disabled:opacity-50">{busy ? "Saving…" : "Save details"}</button>
            <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              Registered students are notified when the time, venue, title or online status changes.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
