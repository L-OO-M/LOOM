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

export function BulkRolePanel({ students, departments }) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set());
  const [mode, setMode] = useState("role");
  const [role, setRole] = useState("core");
  const [departmentId, setDepartmentId] = useState("");
  const [membershipLevel, setMembershipLevel] = useState("general");
  const [vertical, setVertical] = useState("technical");
  const [step, setStep] = useState("edit");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const ids = students.map((s) => s.user_id).filter(Boolean);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const department = departments.find((d) => String(d.id || d.slug) === String(departmentId));
  const roleLabel = ROLES.find((r) => r.value === role)?.label || role;

  useEffect(() => {
    setSelected(new Set());
    setMessage("");
    setError("");
    setStep("edit");
  }, [students]);

  useEffect(() => {
    setStep("edit");
    setError("");
  }, [mode, role, departmentId, membershipLevel, vertical]);

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

  function review(e) {
    e.preventDefault();
    if (selected.size === 0) {
      setError("Select at least one member.");
      return;
    }
    if (mode === "role" && role === "dept_lead" && !departmentId) {
      setError("Choose the department this batch will lead.");
      return;
    }
    if (mode === "department" && !departmentId) {
      setError("Choose the department to assign.");
      return;
    }
    setError("");
    setStep("confirm");
  }

  async function submit() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = mode === "department"
        ? {
            mode: "department",
            userIds: [...selected],
            departmentId,
            membershipLevel,
            confirm: true
          }
        : {
            mode: "role",
            userIds: [...selected],
            role,
            departmentId: role === "dept_lead" ? departmentId : null,
            vertical: role === "vertical_lead" ? vertical : null,
            confirm: true
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
      setStep("edit");
      router.refresh();
    } catch {
      setError("Network error - nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  if (students.length === 0) return null;

  if (step === "confirm") {
    return (
      <details className="adst-bulk" open>
        <summary className="adst-bulk-summary">Confirm batch change</summary>
        <div className="adst-bulk-form">
          <p className="adst-bulk-msg">
            {mode === "department"
              ? `Add ${selected.size} member${selected.size === 1 ? "" : "s"} to ${department?.name || "the selected department"} as ${membershipLevel}.`
              : `Change ${selected.size} member${selected.size === 1 ? "" : "s"} to ${roleLabel}.`}
          </p>
          <p className="adst-muted">
            Every row is checked for founder protection, self-changes and the last active admin. One audit entry covers the batch.
          </p>
          <div className="adst-bulk-controls">
            <button type="button" onClick={() => setStep("edit")} disabled={busy} className="rounded-full border px-4 py-2 text-xs font-medium" style={{ borderColor: "var(--line)", color: "var(--text)" }}>
              Back
            </button>
            <button type="button" onClick={submit} disabled={busy} className="btn-ink !py-2 text-xs disabled:opacity-50">
              {busy ? "Applying..." : `Confirm ${mode === "department" ? "assignment" : "role change"}`}
            </button>
          </div>
          {error && <p role="alert" className="adst-bulk-msg" style={{ color: "var(--danger)" }}>{error}</p>}
        </div>
      </details>
    );
  }

  return (
    <details className="adst-bulk">
      <summary className="adst-bulk-summary">
        Bulk assign <span className="adst-muted">({selected.size} selected of {students.length} shown)</span>
      </summary>
      <form onSubmit={review} className="adst-bulk-form">
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
            Change
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="role">Role</option>
              <option value="department">Department membership</option>
            </select>
          </label>
          {mode === "role" ? (
            <>
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
            </>
          ) : (
            <>
              <label className="adst-bulk-field">
                Department
                <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required>
                  <option value="">Choose a department</option>
                  {departments.map((d) => <option key={d.slug} value={d.id || d.slug}>{d.name}</option>)}
                </select>
              </label>
              <label className="adst-bulk-field">
                Level
                <select value={membershipLevel} onChange={(e) => setMembershipLevel(e.target.value)}>
                  <option value="general">General member</option>
                  <option value="core">Core member</option>
                </select>
              </label>
            </>
          )}
          <button disabled={busy || selected.size === 0} className="btn-ink !py-2 text-xs disabled:opacity-50">
            Review {selected.size || 0} change{selected.size === 1 ? "" : "s"}
          </button>
        </div>
        {message && <p role="status" className="adst-bulk-msg">{message}</p>}
        {error && <p role="alert" className="adst-bulk-msg" style={{ color: "var(--danger)" }}>{error}</p>}
      </form>
    </details>
  );
}
