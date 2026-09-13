"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SettingsClient({ profile }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: profile?.name || "",
    enrollmentNumber: profile?.enrollment_number || "",
    department: profile?.department || "",
    year: profile?.year || "",
    primaryDomain: profile?.primary_domain || "web",
    githubUsername: profile?.github_username || ""
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        enrollmentNumber: form.enrollmentNumber || null,
        department: form.department || null,
        year: form.year ? Number(form.year) : null,
        primaryDomain: form.primaryDomain || null,
        githubUsername: form.githubUsername || null,
        onboardingCompleted: true
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

  const input = { width: "100%", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14 };
  const label = { fontSize: 12, color: "var(--text-muted)" };
  return (
    <form onSubmit={save} className="grid gap-4 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <label style={label}>Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} style={{ ...input, marginTop: 6 }} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label style={label}>Enrollment<input value={form.enrollmentNumber} onChange={(e) => setForm({ ...form, enrollmentNumber: e.target.value })} style={{ ...input, marginTop: 6 }} /></label>
        <label style={label}>Department<input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} style={{ ...input, marginTop: 6 }} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label style={label}>Year<input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} type="number" min={1} max={6} style={{ ...input, marginTop: 6 }} /></label>
        <label style={label}>Primary domain<input value={form.primaryDomain} onChange={(e) => setForm({ ...form, primaryDomain: e.target.value })} style={{ ...input, marginTop: 6 }} /></label>
      </div>
      <label style={label}>GitHub username<input value={form.githubUsername} onChange={(e) => setForm({ ...form, githubUsername: e.target.value })} pattern="[a-zA-Z0-9-]*" maxLength={39} style={{ ...input, marginTop: 6 }} /></label>
      {msg && <p className="text-xs" style={{ color: msg.includes("✓") ? "var(--accent)" : "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink w-fit disabled:opacity-50">
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
