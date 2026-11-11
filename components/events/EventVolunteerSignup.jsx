"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EventVolunteerSignup({ slots, canVolunteer }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function toggle(slot) {
    setBusy(slot.id);
    setError("");
    try {
      const res = await fetch(`/api/volunteers/${slot.id}/signup`, {
        method: slot.signed_up ? "DELETE" : "POST"
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Could not update your volunteer signup.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error - your signup was not saved.");
    } finally {
      setBusy("");
    }
  }

  if (slots.length === 0) return null;

  return (
    <section className="mt-8" aria-label="Volunteer">
      <p className="meta" style={{ color: "var(--accent)" }}>Volunteer</p>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        Help the evening run. Slots are limited and shown to event operators.
      </p>
      <ul className="mt-3 divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
        {slots.map((slot) => {
          const full = slot.signup_count >= slot.capacity && !slot.signed_up;
          return (
            <li key={slot.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="text-sm" style={{ color: "var(--text)" }}>
                {slot.title} <span className="meta">{slot.signup_count}/{slot.capacity}</span>
              </span>
              <button
                type="button"
                onClick={() => toggle(slot)}
                disabled={!!busy || full || !canVolunteer}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--line)", color: slot.signed_up ? "var(--text-muted)" : "var(--text)" }}
              >
                {busy === slot.id ? "Saving..." : slot.signed_up ? "Leave slot" : full ? "Full" : "Volunteer"}
              </button>
            </li>
          );
        })}
      </ul>
      {!canVolunteer && (
        <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>Volunteer signups close before the event starts.</p>
      )}
      {error && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
    </section>
  );
}
