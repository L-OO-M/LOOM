"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Submitting a seat request. The server owns the decision: it re-reads the
// verified record and refuses if the bar is not met, so this form never decides
// eligibility on its own -- it only shows what came back.
export function RoleRequestForm({ target, departments = [], eligible, disabledReason }) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || "");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Both seats are department-scoped: Core lives on the membership row, and a
  // Head seat runs one department. Neither can be requested in the abstract.
  const needsDepartment = true;

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/role-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target_role: target,
          department_id: needsDepartment ? departmentId : null,
          statement
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body?.error?.message || "That request could not be sent.");
        return;
      }
      setDone(true);
      setStatement("");
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        Request sent. An admin sees your verified record alongside it, and you will be
        notified when it is decided.
      </p>
    );
  }

  if (!eligible) {
    return (
      <p className="text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        {disabledReason || "You cannot ask for this seat yet."}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {needsDepartment && (
        <label className="block text-sm" style={{ color: "var(--text-muted)" }}>
          Department
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
            required
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm" style={{ color: "var(--text-muted)" }}>
        Why you, in your own words
        <textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          rows={4}
          minLength={40}
          maxLength={2000}
          required
          placeholder="Point at the work. Which projects, which reviews, what you would run first."
          className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
        />
      </label>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {statement.trim().length}/40 characters minimum.
      </p>
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn-ink !py-2 text-sm" disabled={busy || statement.trim().length < 40}>
        {busy ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
