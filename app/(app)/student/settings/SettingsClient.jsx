"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function githubLoginFromCard(card) {
  const value = card?.social_links?.github;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.pathname.replace(/^\/+/, "").split("/")[0] || null;
  } catch {
    return null;
  }
}

export default function SettingsClient({ profile, requireUsername = false }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: profile?.name || "",
    enrollmentNumber: profile?.enrollment_number || "",
    department: profile?.department || "",
    year: profile?.year || "",
    primaryDomain: profile?.primary_domain || "web"
  });
  const [card, setCard] = useState(null);
  const [security, setSecurity] = useState(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadIdentity() {
      try {
        const securityRes = await fetch("/api/auth/security");
        const securityData = await securityRes.json();
        if (active && securityData.ok) setSecurity(securityData.data);
      } catch {
        if (active) setSecurity({ auth0: false, managementConfigured: false, hasPassword: true });
      }
      try {
        const cardRes = await fetch("/api/social/profile");
        const cardData = await cardRes.json();
        if (active && cardData.ok) {
          setCard(cardData.data.card || null);
          setUsername(cardData.data.card?.username || "");
        }
      } catch {
        if (active) setCard(null);
      } finally {
        if (active) setIdentityLoaded(true);
      }
    }
    loadIdentity();
    return () => {
      active = false;
    };
  }, []);

  async function saveIdentity() {
    const handle = username.trim().toLowerCase();
    if (requireUsername && !handle) {
      return { ok: false, message: "Claim a public handle before finishing onboarding." };
    }
    if (handle && handle !== card?.username) {
      const res = await fetch("/api/social/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: handle,
          bio: card?.bio || "",
          location: card?.location || null,
          avatarUrl: card?.avatar_url || null,
          github: githubLoginFromCard(card),
          linkedin: card?.social_links?.linkedin || null,
          isPublic: card?.is_public ?? true,
          endorsementsVisible: card?.endorsements_visible
        })
      });
      const data = await res.json();
      if (!data.ok) return { ok: false, message: data.error?.message || "Could not save your public handle." };
      setCard(data.data.card);
    }

    if (password) {
      if (password.length < 8) return { ok: false, message: "Use at least 8 characters for your password." };
      if (password !== confirmPassword) return { ok: false, message: "The passwords do not match." };
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!data.ok) return { ok: false, message: data.error?.message || "Could not set your password." };
      setSecurity((current) => ({ ...(current || {}), hasPassword: true }));
      setPassword("");
      setConfirmPassword("");
    }

    return { ok: true };
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const identity = await saveIdentity();
    if (!identity.ok) {
      setBusy(false);
      setMsg(identity.message);
      return;
    }
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        enrollmentNumber: form.enrollmentNumber || null,
        department: form.department || null,
        year: form.year ? Number(form.year) : null,
        primaryDomain: form.primaryDomain || null,
        onboardingCompleted: true
      })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setMsg("Saved.");
    router.refresh();
  }

  const input = { width: "100%", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14 };
  const label = { fontSize: 12, color: "var(--text-muted)" };
  const canSetPassword = security?.auth0 && security?.managementConfigured && security?.hasPassword !== true;
  const passwordUnavailable = security?.auth0 && !security?.managementConfigured;
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

      <div className="border-t pt-4" style={{ borderColor: "var(--line)" }}>
        <label style={label}>
          Public handle
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. aanya-dev"
            minLength={2}
            maxLength={30}
            required={requireUsername}
            style={{ ...input, marginTop: 6 }}
          />
        </label>
        <p className="meta" style={{ marginTop: 6 }}>
          Your public profile lives at /u/{username.trim().toLowerCase() || "your-handle"}. Letters, numbers, hyphens and underscores.
        </p>
      </div>

      <div className="border-t pt-4" style={{ borderColor: "var(--line)" }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Sign-in and password</p>
        {!identityLoaded && <p className="meta" style={{ marginTop: 6 }}>Checking your sign-in methods...</p>}
        {identityLoaded && !security?.auth0 && (
          <p className="meta" style={{ marginTop: 6 }}>Your password is managed by your current sign-in method.</p>
        )}
        {identityLoaded && passwordUnavailable && (
          <p className="meta" style={{ marginTop: 6 }}>
            Password setup is not available on this deployment yet. Keep using your current sign-in method.
          </p>
        )}
        {identityLoaded && security?.auth0 && security?.hasPassword && (
          <p className="meta" style={{ marginTop: 6 }}>
            Password set. You can sign in with your email and password as well as your connected providers.
          </p>
        )}
        {identityLoaded && canSetPassword && (
          <div className="mt-3 grid gap-3">
            {security?.emailVerified === false && (
              <p className="text-xs" style={{ color: "var(--danger)" }}>Verify your email before adding a password.</p>
            )}
            <label style={label}>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                disabled={security?.emailVerified === false}
                style={{ ...input, marginTop: 6 }}
              />
            </label>
            <label style={label}>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                disabled={security?.emailVerified === false}
                style={{ ...input, marginTop: 6 }}
              />
            </label>
            <p className="meta">Optional: add a password so you can sign in without your social provider.</p>
          </div>
        )}
      </div>

      <div style={label}>
        GitHub username
        <div
          className="flex flex-wrap items-center gap-3"
          style={{ ...input, marginTop: 6, display: "flex", alignItems: "center" }}
        >
          <span style={{ fontWeight: 600 }}>
            {profile?.github_username || "Not linked"}
          </span>
          <Link
            href="/student/github"
            prefetch={false}
            className="text-xs font-semibold underline"
            style={{ color: "var(--accent)", marginLeft: "auto" }}
          >
            {profile?.github_username ? "Change on GitHub" : "Link GitHub"}
          </Link>
        </div>
        <p className="meta" style={{ marginTop: 6 }}>
          Your handle is linked on the GitHub page, where one handle can belong to
          only one member.
        </p>
      </div>
      {msg && <p className="text-xs" style={{ color: msg === "Saved." ? "var(--accent)" : "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink w-fit disabled:opacity-50">
        {busy ? "Saving..." : requireUsername ? "Finish onboarding" : "Save profile"}
      </button>
    </form>
  );
}
