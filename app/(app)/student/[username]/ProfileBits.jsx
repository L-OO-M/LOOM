"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { inputStyle, Field } from "@/components/ui";
import { mergeSocialLinks, socialLinksForDisplay } from "@/lib/profileFolio";

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

// Seed the developer-profile fields from the stored card. GitHub/LeetCode are
// handles; the rest are URLs. Reading through the shared helper means the editor
// and the public card cannot disagree about what is stored.
function linkFormFromCard(card) {
  const display = socialLinksForDisplay(card || {});
  const handleKeys = ["github", "leetcode", "discord", "kaggle", "unstop", "devfolio", "huggingface"];
  return {
    github: display.github?.handle || "",
    leetcode: display.leetcode?.handle || "",
    huggingface: display.huggingface?.handle || "",
    kaggle: display.kaggle?.handle || "",
    devfolio: display.devfolio?.handle || "",
    unstop: display.unstop?.handle || "",
    discord: display.discord?.handle || "",
    linkedin: display.linkedin?.url || "",
    x: display.x?.url || "",
    website: display.website?.url || "",
    ...Object.fromEntries(handleKeys.filter((key) => !display[key]).map((key) => [key, ""]))
  };
}

function linkErrorsFor(form) {
  const { errors } = mergeSocialLinks({}, form);
  return Object.fromEntries(errors.map((error) => [error.field, error.message]));
}

export function ProfileEditor({ initial, name = "", canPhoto = false }) {
  const router = useRouter();
  const [username, setUsername] = useState(initial?.username || "");
  const [bio, setBio] = useState(initial?.bio || "");
  const [location, setLocation] = useState(initial?.location || "");
  const [photo, setPhoto] = useState(initial?.avatar_url || "");
  const [links, setLinks] = useState(() => linkFormFromCard(initial));
  const [linkErrors, setLinkErrors] = useState({});
  const [isPublic, setIsPublic] = useState(initial?.is_public ?? true);
  const [showEndorsements, setShowEndorsements] = useState(initial?.endorsements_visible ?? true);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const [identityRefresh, setIdentityRefresh] = useState(0);
  const previewPhoto = safeImageUrl(photo);
  const [busy, setBusy] = useState(false);

  function setLink(key, value) {
    setLinks((current) => ({ ...current, [key]: value }));
    setLinkErrors((current) => ({ ...current, [key]: undefined }));
    setSaved(false);
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setSaved(false);
    setMsg("");
    const nextErrors = linkErrorsFor(links);
    if (Object.keys(nextErrors).length > 0) {
      setLinkErrors(nextErrors);
      setMsg("Check the highlighted developer profiles, then save again.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/social/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username,
          bio,
          location: location || null,
          // Send every field so a cleared input clears the stored key. The route
          // merges over social_links and preserves anything it does not know.
          links,
          isPublic,
          endorsementsVisible: showEndorsements,
          ...(canPhoto ? { avatarUrl: photo.trim() || null } : {})
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setMsg(data?.error?.message || `Couldn't save (error ${res.status}). Try again.`);
        return;
      }
      setSaved(true);
      setLinkErrors({});
      // The ownership panel reads its own state from /api/identity, so nudge it
      // to refetch: a handle just saved here must appear as a claim it can check.
      setIdentityRefresh((n) => n + 1);
      router.push(`/student/${data.data.card.username}`);
      router.refresh();
    } catch {
      setMsg("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const linkFields = [
    { key: "github", label: "GitHub handle", placeholder: "octocat", hint: "Your login. Repos and pushes sync from the connected account." },
    { key: "leetcode", label: "LeetCode handle", placeholder: "neal_wu", hint: "Solved counts sync automatically from practice." },
    { key: "huggingface", label: "Hugging Face handle", placeholder: "username", hint: "Models, datasets and Spaces." },
    { key: "kaggle", label: "Kaggle handle", placeholder: "username", hint: "Notebooks and competitions." },
    { key: "devfolio", label: "Devfolio handle", placeholder: "username", hint: "Hackathon projects." },
    { key: "unstop", label: "Unstop handle", placeholder: "username", hint: "Competitions and certificates." },
    { key: "discord", label: "Discord username", placeholder: "username", hint: "Shown on your card; has no public profile URL." },
    { key: "linkedin", label: "LinkedIn URL", placeholder: "https://linkedin.com/in/…", type: "url" },
    { key: "x", label: "X profile URL", placeholder: "https://x.com/…", type: "url" },
    { key: "website", label: "Personal site", placeholder: "https://…", type: "url" }
  ];

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

        <fieldset className="folio-links-fieldset">
          <legend className="folio-links-legend">Developer profiles</legend>
          <p className="folio-field-note">
            Link the accounts that hold your work. LOOM reads proof from them, so
            nobody has to re-type stats.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {linkFields.map((field) => {
              const error = linkErrors[field.key];
              const errorId = `link-${field.key}-error`;
              return (
                <div key={field.key} className={field.key === "website" ? "sm:col-span-2" : undefined}>
                  <Field label={field.label}>
                    <input
                      value={links[field.key]}
                      onChange={(e) => setLink(field.key, e.target.value)}
                      onBlur={() => {
                        const errorText = linkErrorsFor({ [field.key]: links[field.key] })[field.key];
                        setLinkErrors((current) => ({ ...current, [field.key]: errorText }));
                      }}
                      type={field.type || "text"}
                      inputMode={field.type === "url" ? "url" : undefined}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder={field.placeholder}
                      maxLength={300}
                      style={error ? { ...inputStyle, borderColor: "var(--danger)" } : inputStyle}
                      aria-invalid={error ? "true" : undefined}
                      aria-describedby={error ? errorId : undefined}
                    />
                  </Field>
                  {error ? (
                    <p id={errorId} role="alert" className="folio-field-error">{error}</p>
                  ) : field.hint ? (
                    <p className="folio-field-note">{field.hint}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </fieldset>

        <IdentityVerification refreshKey={identityRefresh} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Location (optional)">
            <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} style={inputStyle} />
          </Field>
        </div>
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
        {saved && !msg && <p role="status" className="text-xs" style={{ color: "var(--accent)" }}>Saved — your public card is updated.</p>}
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

/**
 * Ownership checks for linked accounts.
 *
 * A saved handle is a claim. This panel proves control without ever asking for a
 * password: the member pastes a one-time code into a public page they control,
 * and the server fetches that page and looks for it. GitHub can verify itself
 * through the existing OAuth connection; LeetCode's API confirms the account
 * exists but exposes no bio, so that stays honestly "linked", not "verified".
 */
function IdentityVerification({ refreshKey = 0 }) {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState({});

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/identity");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error?.message || "Could not load your linked accounts.");
        return;
      }
      setProviders(data.data.providers || []);
      setError("");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [refreshKey]);

  // A handle saved through the profile form is only a claim. Minting its
  // one-time code goes through the same save endpoint, which also records the
  // claim in identity_links; without that the panel has nothing to check.
  async function ensureToken(provider, handle) {
    setBusy(provider);
    try {
      const res = await fetch("/api/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, value: handle })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setNote((current) => ({
          ...current,
          [provider]: data?.error?.message || "Could not create a code for this account."
        }));
        return;
      }
      await load();
    } catch {
      setNote((current) => ({ ...current, [provider]: "Could not reach the server." }));
    } finally {
      setBusy("");
    }
  }

  async function verify(provider) {
    if (busy) return;
    setBusy(provider);
    setNote((current) => ({ ...current, [provider]: "" }));
    try {
      const res = await fetch("/api/identity/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, proofUrl })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setNote((current) => ({ ...current, [provider]: data?.error?.message || "That check did not pass." }));
        return;
      }
      setNote((current) => ({ ...current, [provider]: "Verified. The tick is live on your public card." }));
      setOpen("");
      setProofUrl("");
      await load();
    } catch {
      setNote((current) => ({ ...current, [provider]: "Could not reach the server." }));
    } finally {
      setBusy("");
    }
  }

  const linked = providers.filter((p) => p.handle);
  if (loading) {
    return <p className="folio-field-note">Checking your linked accounts…</p>;
  }
  if (error) {
    return <p className="folio-field-note" role="alert">{error}</p>;
  }
  if (linked.length === 0) {
    return (
      <p className="folio-field-note">
        Save a handle above, then come back here to prove it is yours.
      </p>
    );
  }

  return (
    <fieldset className="folio-verify">
      <legend className="folio-links-legend">Ownership checks</legend>
      <p className="folio-field-note">
        We never ask for a password. Verified means a machine could check the
        account against something you control. Everything else stays an honest
        claim.
      </p>
      <ul className="folio-verify-list">
        {linked.map((p) => {
          const canToken = !["leetcode", "discord"].includes(p.key);
          const isOpen = open === p.key;
          return (
            <li key={p.key} className="folio-verify-row">
              <div className="folio-verify-head">
                <span className="folio-verify-name">{p.label}</span>
                <span className="folio-verify-handle">@{p.handle}</span>
                <span className={`folio-verify-state is-${p.status || "claimed"}`}>
                  {p.status === "verified" ? "Verified"
                    : p.status === "linked" ? "Linked"
                    : p.status === "rejected" ? "Check failed"
                    : "Claimed"}
                </span>
                {p.status !== "verified" && canToken ? (
                  <button
                    type="button"
                    className="folio-verify-action"
                    onClick={async () => {
                      const next = isOpen ? "" : p.key;
                      setOpen(next);
                      setProofUrl(p.proofUrl || "");
                      setNote((current) => ({ ...current, [p.key]: "" }));
                      if (next && !p.verifyToken) await ensureToken(p.key, p.handle);
                    }}
                  >
                    {isOpen ? "Cancel" : "Verify"}
                  </button>
                ) : null}
                {p.status !== "verified" && p.key === "github" ? (
                  <Link href="/student/github" prefetch={false} className="folio-verify-action">Connect GitHub</Link>
                ) : null}
              </div>

              {p.status === "linked" && p.key === "leetcode" ? (
                <p className="folio-field-note">
                  LeetCode confirms this account exists, but has no public bio to
                  check, so it is linked rather than ownership-verified.
                </p>
              ) : null}
              {p.key === "discord" && p.status !== "verified" ? (
                <p className="folio-field-note">
                  Discord has no public profile page. This stays a claim.
                </p>
              ) : null}

              {isOpen && (
                <div className="folio-verify-proof">
                  <p className="folio-field-note">
                    Paste this code into a public spot on {p.label} (bio, profile
                    README, pinned post, or a gist), save it, then paste the page
                    URL here.
                  </p>
                  <code className="folio-verify-code">{p.verifyToken || "Preparing your code…"}</code>
                  <div className="folio-verify-proof-row">
                    <input
                      value={proofUrl}
                      onChange={(e) => setProofUrl(e.target.value)}
                      placeholder="https://…"
                      type="url"
                      style={inputStyle}
                      aria-label={`Public ${p.label} page containing your code`}
                    />
                    <button
                      type="button"
                      className="btn-ink !py-2 text-sm"
                      disabled={busy === p.key || !proofUrl.trim() || !p.verifyToken}
                      onClick={() => verify(p.key)}
                    >
                      {busy === p.key ? "Checking…" : "Check page"}
                    </button>
                  </div>
                  {note[p.key] ? <p className="folio-field-error" role="alert">{note[p.key]}</p> : null}
                </div>
              )}
              {note[p.key] && !isOpen ? <p className="folio-field-note">{note[p.key]}</p> : null}
            </li>
          );
        })}
      </ul>
    </fieldset>
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
