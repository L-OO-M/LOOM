"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, AlertTriangle, Check } from "lucide-react";

export default function RoleForm({ userId, currentRole }) {
  const router = useRouter();
  const [role, setRole] = useState(currentRole);
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [vertical, setVertical] = useState("technical");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Public departments list is unauthenticated by design; failures are silent
    // because role assignment falls back to the API's own tenant checks.
    fetch("/api/public/departments").then((r) => r.json()).then((d) => {
      const list = d?.data?.departments ?? d?.departments ?? [];
      if (Array.isArray(list)) setDepartments(list);
    }).catch(() => {});
    // Fallback: legacy endpoint
    if (departments.length === 0) {
      fetch("/api/departments").then((r) => r.json()).then((d) => {
        const list = d?.data?.departments ?? [];
        if (Array.isArray(list) && list.length) setDepartments(list);
      }).catch(() => {});
    }
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
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!data?.ok) {
      setMsg(data?.error?.message || "Failed — check department/vertical");
      return;
    }
    setMsg("Saved ✓");
    router.refresh();
  }

  const select = "rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_16%,transparent)]";

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" className={select} style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>
          <option value="student">Student · General</option>
          <option value="core">Core · Core Member</option>
          <option value="dept_lead">Head / Co-Head · dept_lead</option>
          <option value="vertical_lead">Vertical Lead</option>
          <option value="admin">Super Admin</option>
        </select>
        {role === "dept_lead" && (
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required aria-label="Department to lead" className={select} style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>
            <option value="">Choose department…</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.vertical}</option>)}
          </select>
        )}
        {role === "vertical_lead" && (
          <select value={vertical} onChange={(e) => setVertical(e.target.value)} aria-label="Vertical" className={select} style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>
            <option value="technical">Technical</option>
            <option value="non_technical">Non-technical</option>
          </select>
        )}
        <button disabled={busy} className="btn-ink inline-flex items-center gap-1.5 disabled:opacity-50">
          {busy ? "Saving…" : <><ShieldCheck size={14} /> Save role</>}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {role !== currentRole && <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1" style={{ borderColor: "color-mix(in srgb, var(--accent) 22%, transparent)", background: "color-mix(in srgb, var(--accent) 10%, var(--bg))", color: "var(--accent)" }}><AlertTriangle size={12} /> {currentRole} → {role}</span>}
        {msg && (
          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1" style={{ borderColor: msg.includes("✓") ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "color-mix(in srgb, var(--danger) 22%, transparent)", background: msg.includes("✓") ? "color-mix(in srgb, var(--accent) 10%, var(--bg))" : "color-mix(in srgb, var(--danger) 10%, var(--bg))", color: msg.includes("✓") ? "var(--accent)" : "var(--danger)" }}>
            {msg.includes("✓") ? <Check size={12} /> : <AlertTriangle size={12} />} {msg}
          </span>
        )}
      </div>

      <p className="meta">
        {role === "dept_lead" && "Heads are scoped to one department — the student also becomes a dept_lead member there."}
        {role === "vertical_lead" && "Vertical leads are scoped to technical or non-technical — checked on every mutation."}
        {role === "admin" && "Admin is global to this chapter. Prefer scoped leads where possible."}
        {role === "core" && "Core members can be marked succession-ready by their Head."}
        {role === "student" && "General membership — the default after signup."}
      </p>
    </form>
  );
}
