"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = [
  { value: "core", label: "Core member" },
  { value: "dept_lead", label: "Department Head" },
  { value: "vertical_lead", label: "Vertical Lead" },
  { value: "admin", label: "Super Admin" },
  { value: "student", label: "Student" }
];

// Bulk role assignment for the rows currently on screen. Reuses
// /api/admin/students/bulk, which enforces founder/self/last-admin guards and
// writes one audit entry for the whole batch.
export function BulkRolePanel({ students, departments }) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set());
  const [role, setRole] = useState("core");
  const [departmentId, setDepartmentId] = useState("");
  const [vertical, setVertical] = useState("technical");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const ids = students.map((s) => s.user_id).filter(Boolean);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

  useEffect(() => {
    setSelected(new Set());
    setMessage("");
    setError("");
  }, [students]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(ids));
  }

  async function submit(e) {
    e.preventDefault();
    if (selected.size === 0) {
      setError("Select at least one member.");
      return;
    }
    if (role === "dept_lead" && !departmentId) {
      setError("Choose the department this batch will lead.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = {
        userIds: [...selected],
        role,
        departmentId: role === "dept_lead" ? departmentId : null,
        vertical: role === "vertical_lead" ? vertical : null
      };
      const res = await fetch("/api/admin/students/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Could not update this batch.");
        return;
      }
      setMessage(`${data.data?.updated ?? selected.size} member${(data.data?.updated ?? selected.size) === 1 ? "" : "s"} updated.`);
      setSelected(new Set());
      router.refresh();
    } catch {
      setError("Network error - nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  if (students.length === 0) return null;

  return (
    <details className="adst-bulk">
      <summary className="adst-bulk-summary">
        Bulk assign roles <span className="adst-muted">({selected.size} selected of {students.length} shown)</span>
      </summary>
      <form onSubmit={submit} className="adst-bulk-form">
        <div className="adst-bulk-list" role="group" aria-label="Members on this page">
          <label className="adst-bulk-check">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Select all on this page
          </label>
          {students.map((s) => (
            <label key={s.user_id} className="adst-bulk-check">
              <input type="checkbox" checked={selected.has(s.user_id)} onChange={() => toggle(s.user_id)} />
              <span className="adst-bulk-name">{s.name || s.user_id.slice(0, 8)}</span>
              <span className="adst-muted">{String(s.role || "student").replaceAll("_", " ")}</span>
            </label>
          ))}
        </div>
        <div className="adst-bulk-controls">
          <label className="adst-bulk-field">
            New role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          {role === "dept_lead" && (
            <label className="adst-bulk-field">
              Department
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required>
                <option value="">Choose a department</option>
                {departments.map((d) => <option key={d.slug} value={d.id || d.slug}>{d.name}</option>)}
              </select>
            </label>
          )}
          {role === "vertical_lead" && (
            <label className="adst-bulk-field">
              Vertical
              <select value={vertical} onChange={(e) => setVertical(e.target.value)}>
                <option value="technical">Technical</option>
                <option value="non_technical">Non-technical</option>
              </select>
            </label>
          )}
          <button disabled={busy} className="btn-ink !py-2 text-xs disabled:opacity-50">
            {busy ? "Assigning…" : `Assign to ${selected.size || 0}`}
          </button>
        </div>
        {message && <p role="status" className="adst-bulk-msg">{message}</p>}
        {error && <p role="alert" className="adst-bulk-msg" style={{ color: "var(--danger)" }}>{error}</p>}
      </form>
    </details>
  );
}
