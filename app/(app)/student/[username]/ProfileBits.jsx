"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";

export function ProfileEditor({ initial }) {
  const router = useRouter();
  const [username, setUsername] = useState(initial?.username || "");
  const [bio, setBio] = useState(initial?.bio || "");
  const [location, setLocation] = useState(initial?.location || "");
  const [github, setGithub] = useState(initial?.social_links?.github ? initial.social_links.github.split("/").pop() : "");
  const [linkedin, setLinkedin] = useState(initial?.social_links?.linkedin || "");
  const [isPublic, setIsPublic] = useState(initial?.is_public ?? true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/social/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, bio, location: location || null, github: github || null, linkedin: linkedin || null, isPublic })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    router.push(`/student/${data.data.card.username}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <Field label="Username (your public URL)"><input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={2} maxLength={30} style={inputStyle} /></Field>
      <Field label="Bio"><textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} maxLength={300} style={inputStyle} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Location (optional)"><input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} style={inputStyle} /></Field>
        <Field label="GitHub handle (optional)"><input value={github} onChange={(e) => setGithub(e.target.value)} maxLength={60} placeholder="octocat" style={inputStyle} /></Field>
      </div>
      <Field label="LinkedIn URL (optional)"><input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} type="url" style={inputStyle} /></Field>
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Public profile
      </label>
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink disabled:opacity-50">{busy ? "Saving…" : initial ? "Save card" : "Claim username"}</button>
    </form>
  );
}

export function FollowButton({ username, initial }) {
  const router = useRouter();
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await fetch("/api/social/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    setBusy(false);
    if (data.ok) {
      setFollowing(data.data.following);
      router.refresh();
    }
  }

  return (
    <button disabled={busy} onClick={toggle} className={following ? "rounded-xl border px-4 py-2 text-sm disabled:opacity-50" : "btn-ink disabled:opacity-50"}
      style={following ? { borderColor: "var(--line)", color: "var(--text-muted)" } : undefined}>
      {following ? "Following ✓" : "Follow"}
    </button>
  );
}

export function EndorseForm({ username }) {
  const router = useRouter();
  const [skill, setSkill] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/social/connections?mode=endorse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, skill })
    });
    const data = await res.json();
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setSkill("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
      <Field label="Endorse a skill">
        <input value={skill} onChange={(e) => setSkill(e.target.value)} required minLength={2} maxLength={40} placeholder="React" style={{ ...inputStyle, minWidth: 140 }} />
      </Field>
      <button className="btn-ink">Endorse</button>
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
    </form>
  );
}
