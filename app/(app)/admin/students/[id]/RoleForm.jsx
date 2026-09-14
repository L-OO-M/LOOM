"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RoleForm({ userId, currentRole }) {
  const router = useRouter();
  const [role, setRole] = useState(currentRole);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/students", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, role }) });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setMsg("Saved ✓");
    router.refresh();
  }
  return (
    <form onSubmit={save} className="flex items-center gap-2">
      <select value={role} onChange={(e) => setRole(e.target.value)} style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14 }}>
        <option value="student">student · General</option>
        <option value="core">core · Core Member</option>
        <option value="dept_lead">dept_lead · Head / Co-Head</option>
        <option value="vertical_lead">vertical_lead · Vertical Lead</option>
        <option value="admin">admin · Super Admin</option>
      </select>
      <button disabled={busy} className="btn-ink disabled:opacity-50">
        {busy ? "Saving…" : "Save role"}
      </button>
      {msg && <span className="text-xs" style={{ color: msg.includes("✓") ? "var(--accent)" : "var(--danger)" }}>{msg}</span>}
    </form>
  );
}
