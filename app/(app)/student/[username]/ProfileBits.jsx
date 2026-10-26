"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";

function previewInitials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function safeImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

export function ProfileEditor({ initial, name = "", canPhoto = false }) {
  const router = useRouter();
  const [username, setUsername] = useState(initial?.username || "");
  const [bio, setBio] = useState(initial?.bio || "");
  const [location, setLocation] = useState(initial?.location || "");
  const [photo, setPhoto] = useState(initial?.avatar_url || "");
  const [github, setGithub] = useState(initial?.social_links?.github ? initial.social_links.github.split("/").pop() : "");
  const [linkedin, setLinkedin] = useState(initial?.social_links?.linkedin || "");
  const [isPublic, setIsPublic] = useState(initial?.is_public ?? true);
  const [showEndorsements, setShowEndorsements] = useState(initial?.endorsements_visible ?? true);
  const [msg, setMsg] = useState("");
  const previewPhoto = safeImageUrl(photo);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/social/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, bio, location: location || null, github: github || null, linkedin: linkedin || null, isPublic, endorsementsVisible: showEndorsements, ...(canPhoto ? { avatarUrl: photo.trim() || null } : {}) })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setMsg(data?.error?.message || `Couldn't save (error ${res.status}). Try again.`);
        return;
      }
      router.push(`/student/${data.data.card.username}`);
      router.refresh();
    } catch {
      setMsg("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="folio-editor-grid">
      <div className="space-y-3">
        <Field label="Username (your public URL)">
          <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={2} maxLength={30} style={inputStyle} />
        </Field>
        <div>
          <Field label="Bio">
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={300} style={inputStyle} aria-describedby="bio-count" />
          </Field>
          <span className="folio-counter" id="bio-count">{bio.length}/300</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Location (optional)">
            <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} style={inputStyle} />
          </Field>
          <Field label="GitHub handle (optional)">
            <input value={github} onChange={(e) => setGithub(e.target.value)} maxLength={60} placeholder="octocat" style={inputStyle} />
          </Field>
        </div>
        <Field label="LinkedIn URL (optional)">
          <input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} type="url" style={inputStyle} />
        </Field>
        {canPhoto && (
          <div className="space-y-1.5">
            <Field label="Photo URL">
              <input value={photo} onChange={(e) => setPhoto(e.target.value)} type="url" maxLength={500} placeholder="https://…" style={inputStyle} />
            </Field>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Leads and heads are shown with a photo on the public site, so this is required for your role.</p>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Public profile
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
          <input type="checkbox" checked={showEndorsements} onChange={(e) => setShowEndorsements(e.target.checked)} /> Show endorsements on my profile
        </label>
        {msg && <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
        <div className="folio-editor-actions">
          <button disabled={busy} className="btn-ink disabled:opacity-50">{busy ? "Saving…" : initial ? "Save card" : "Claim username"}</button>
          <span className="folio-section-note">Changes are audited and go live immediately.</span>
        </div>
      </div>

      <aside className="folio-editor-preview" aria-label="Live preview of your cover">
        <span className="folio-preview-label">Live cover preview</span>
        <div className="folio-preview-avatar">
          {canPhoto && previewPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewPhoto} alt="" />
          ) : (
            <span aria-hidden="true">{previewInitials(name || username)}</span>
          )}
        </div>
        <p className="folio-preview-name">{name || username || "Your name"}</p>
        <span className="folio-preview-handle">@{username || "handle"}</span>
        <p className="folio-preview-bio">{bio || "Your bio will appear here."}</p>
      </aside>
    </form>
  );
}

export function FollowButton({ username, initial }) {
  const router = useRouter();
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/social/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErr(data?.error?.message || `Couldn't update (error ${res.status}). Try again.`);
        return;
      }
      setFollowing(data.data.following);
      router.refresh();
    } catch {
      setErr("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={toggle}
        aria-pressed={following}
        aria-label={following ? `Unfollow ${username}` : `Follow ${username}`}
        className="folio-follow disabled:opacity-50"
      >
        {busy ? "…" : following ? "Following" : "Follow"}
      </button>
      {err && <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{err}</p>}
    </div>
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
    <form onSubmit={submit} className="folio-endorse">
      <Field label="Endorse a skill">
        <input value={skill} onChange={(e) => setSkill(e.target.value)} required minLength={2} maxLength={40} placeholder="React" style={{ ...inputStyle, minWidth: 160 }} />
      </Field>
      <button className="btn-ink">Endorse</button>
      {msg && <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
    </form>
  );
}

// Owner-only: remove an endorsement they received. The security report found a
// member had no way to take down an abusive endorsement about themselves.
export function EndorsementManager({ endorsements = [] }) {
  const router = useRouter();
  const [items, setItems] = useState(endorsements);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState("");

  async function remove(id) {
    setBusy(id);
    setMsg("");
    try {
      const res = await fetch(`/api/social/connections?mode=endorsement&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!data?.ok) { setMsg(data?.error?.message || "Could not remove"); setBusy(null); return; }
      setItems((prev) => prev.filter((e) => e.id !== id));
      router.refresh();
    } catch {
      setMsg("Network error — try again");
    }
    setBusy(null);
  }

  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="folio-section-note">Endorsements you received</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 text-sm" style={{ color: "var(--text)" }}>
            <span className="min-w-0 truncate">{e.skill}{e.endorser_name ? <span style={{ color: "var(--text-muted)" }}> · from {e.endorser_name}</span> : null}</span>
            <button type="button" disabled={busy === e.id} onClick={() => remove(e.id)} className="shrink-0 font-semibold hover:underline disabled:opacity-50" style={{ color: "var(--danger)" }}>{busy === e.id ? "Removing…" : "Remove"}</button>
          </li>
        ))}
      </ul>
      {msg && <p className="mt-2 text-xs" role="alert" style={{ color: "var(--danger)" }}>{msg}</p>}
    </div>
  );
}
