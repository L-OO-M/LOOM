"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputStyle } from "@/components/ui";

export function EventVolunteerAdmin({ eventId, slots, signups }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [capacity, setCapacity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/volunteers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, title: title.trim(), capacity: Number(capacity) })
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Could not create the slot.");
        return;
      }
      setTitle("");
      setCapacity("1");
      router.refresh();
    } catch {
      setError("Network error - nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 grid gap-4">
      <form onSubmit={create} className="flex flex-wrap items-end gap-2">
        <Field label="Volunteer job">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={3}
            maxLength={160}
            placeholder="e.g. AV desk, registration"
            style={{ ...inputStyle, minWidth: 220 }}
          />
        </Field>
        <Field label="People needed">
          <input
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            type="number"
            min={1}
            max={10000}
            style={{ ...inputStyle, width: 100 }}
          />
        </Field>
        <button className="btn-ink !py-2 text-xs" disabled={busy}>
          {busy ? "Adding..." : "Add slot"}
        </button>
      </form>
      {error && <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}

      {slots.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No volunteer slots yet. Add the jobs this event needs.</p>
      ) : (
        <ul className="divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
          {slots.map((slot) => {
            const roster = signups.filter((s) => s.slot_id === slot.id);
            return (
              <li key={slot.id} className="px-4 py-3">
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                  {slot.title} <span className="meta">{slot.signup_count}/{slot.capacity} filled</span>
                </p>
                {roster.length === 0 ? (
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>No volunteers yet.</p>
                ) : (
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {roster.map((s) => s.student_name || s.email || s.user_id).join(", ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
