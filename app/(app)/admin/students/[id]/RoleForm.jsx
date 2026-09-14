"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function RoleForm({ userId, currentRole }) {
  const router = useRouter();
  const [role, setRole] = useState(currentRole);
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [vertical, setVertical] = useState("technical");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/departments").then((r) => r.json()).then((d) => {
      if (d?.ok) setDepartments(d.data.departments);
    }).catch(() => {});
  }, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/students", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId, role,
        departmentId: role === "dept_lead" ? departmentId || null : null,
        vertical: role === "vertical_lead" ? vertical : null
      })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setMsg("Saved ✓");
    router.refresh();
  }
  const select = { borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14 };
  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" style={select}>
        <option value="student">student · General</option>
        <option value="core">core · Core Member</option>
        <option value="dept_lead">dept_lead · Head / Co-Head</option>
        <option value="vertical_lead">vertical_lead · Vertical Lead</option>
        <option value="admin">admin · Super Admin</option>
      </select>
      {role === "dept_lead" && (
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required aria-label="Department to lead" style={select}>
          <option value="">Choose department…</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}
      {role === "vertical_lead" && (
        <select value={vertical} onChange={(e) => setVertical(e.target.value)} aria-label="Vertical" style={select}>
          <option value="technical">technical</option>
          <option value="non_technical">non-technical</option>
        </select>
      )}
      <button disabled={busy} className="btn-ink disabled:opacity-50">
        {busy ? "Saving…" : "Save role"}
      </button>
      {msg && <span className="text-xs" style={{ color: msg.includes("✓") ? "var(--accent)" : "var(--danger)" }}>{msg}</span>}
    </form>
  );
}
