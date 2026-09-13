"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";

export function BadgeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tier, setTier] = useState(1);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/badges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description, tier: Number(tier) })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setName("");
    setDescription("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <Field label="Badge name"><input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={120} placeholder="DSA Contest Master" style={inputStyle} /></Field>
      <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Won 2 DSA contests" style={inputStyle} /></Field>
      <Field label="Tier">
        <select value={tier} onChange={(e) => setTier(e.target.value)} style={inputStyle}>
          <option value={1}>1 · Bronze</option>
          <option value={2}>2 · Silver</option>
          <option value={3}>3 · Gold</option>
        </select>
      </Field>
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink disabled:opacity-50">{busy ? "Creating…" : "Define badge"}</button>
    </form>
  );
}

export function IssueForm({ students, badges }) {
  const router = useRouter();
  const [studentId, setStudentId] = useState(students[0]?.user_id || "");
  const [badgeId, setBadgeId] = useState("");
  const [level, setLevel] = useState("gold");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/achievements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentId, badgeId: badgeId || null, level, evidenceUrl: evidenceUrl || null })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setEvidenceUrl("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <Field label="Student">
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={inputStyle}>
          {students.map((s) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Badge (optional — leave empty for a manual achievement)">
        <select value={badgeId} onChange={(e) => setBadgeId(e.target.value)} style={inputStyle}>
          <option value="">Manual achievement</option>
          {badges.map((b) => <option key={b.id} value={b.id}>{b.name} (tier {b.tier})</option>)}
        </select>
      </Field>
      <Field label="Level">
        <select value={level} onChange={(e) => setLevel(e.target.value)} style={inputStyle}>
          <option value="bronze">Bronze</option>
          <option value="silver">Silver</option>
          <option value="gold">Gold</option>
        </select>
      </Field>
      <Field label="Evidence URL (optional)"><input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} type="url" placeholder="https://…" style={inputStyle} /></Field>
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink disabled:opacity-50">{busy ? "Issuing…" : "Issue achievement"}</button>
    </form>
  );
}
