"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normalizeDomainKey } from "@/lib/domains";
import { handleFromProfileUrl } from "@/lib/profileFolio";
import DomainPicker from "../_components/DomainPicker";

export default function SettingsClient({ profile, domains = [] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: profile?.name || "",
    enrollmentNumber: profile?.enrollment_number || "",
    department: profile?.department || "",
    year: profile?.year || "",
    institution: profile?.institution || "",
    location: profile?.location || "",
    primaryDomain:
      normalizeDomainKey(profile?.primary_domain) || domains[0]?.key || ""
  });
  const [card, setCard] = useState(null);
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadIdentity() {
      try {
        const cardRes = await fetch("/api/social/profile");
        const cardData = await cardRes.json();
        if (active && cardData.ok) {
          setCard(cardData.data.card || null);
          setUsername(cardData.data.card?.username || "");
        }
      } catch {
        if (active) setCard(null);
      }
    }
    loadIdentity();
    return () => {
      active = false;
    };
  }, []);

  // The public handle is optional; a taken one reports itself without touching
  // the profile below it.
  async function saveCard() {
    const handle = username.trim().toLowerCase();
    if (!handle || handle === card?.username) return { ok: true };
    const res = await fetch("/api/social/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: handle,
        bio: card?.bio || "",
        // The card editor owns this field once set; seed it from the city the
        // member just typed when the card has none, so onboarding does not leave
        // the public card blank while the profile has a location.
        location: card?.location || form.location.trim() || null,
        avatarUrl: card?.avatar_url || null,
        github: handleFromProfileUrl("github", card?.social_links?.github),
        linkedin: card?.social_links?.linkedin || null,
        isPublic: card?.is_public ?? true,
        endorsementsVisible: card?.endorsements_visible
      })
    });
    const data = await res.json();
    if (!data.ok) {
      return { ok: false, message: `Your public handle was not saved — ${data.error?.message || "try another"}.` };
    }
    setCard(data.data.card);
    return { ok: true };
  }

  // The profile is the member's actual work; a rejected handle reports itself
  // without discarding it. Passwords are handled by AccountSecurityCard, which
  // is the single password surface on this page — a second form here used to
  // disagree with it about whether a password existed.
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          enrollmentNumber: form.enrollmentNumber.trim() || null,
          department: form.department.trim() || null,
          year: form.year === "" || form.year === null ? null : Number(form.year),
          institution: form.institution.trim() || null,
          location: form.location.trim() || null,
          primaryDomain: form.primaryDomain || null,
          onboardingCompleted: true
        })
      });
      const data = await res.json();
      if (!data.ok) {
        // The route now names the offending field; say which one instead of a
        // bare "Failed".
        const label = data.error?.details?.field;
        const hint = {
          name: "Check your name.",
          year: "Check your year (1–6).",
          primaryDomain: "Pick one of the available tracks.",
          department: "Check your branch.",
          enrollmentNumber: "Check your enrollment number."
        }[label];
        setMsg([data.error?.message, hint].filter(Boolean).join(" "));
        return;
      }

      const cardResult = await saveCard();
      setMsg(cardResult.ok ? "Saved." : `Profile saved. ${cardResult.message}`);
      router.refresh();
    } catch {
      // A dropped connection must not leave the button disabled forever.
      setMsg("Could not save your profile. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
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
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label style={label}>
          College or institution
          <input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} placeholder="Your college" maxLength={120} style={{ ...input, marginTop: 6 }} />
        </label>
        <label style={label}>
          City
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Where it is" maxLength={80} style={{ ...input, marginTop: 6 }} />
        </label>
      </div>
      <p className="meta" style={{ marginTop: -4 }}>
        Changing your college here does not move you between chapters — after onboarding, that is an admin decision.
      </p>

      <div>
        <p style={label}>Primary track</p>
        <p className="meta" style={{ marginTop: 4, marginBottom: 10 }}>
          The roadmap that opens first for you. Switching this does not delete progress on another track.
        </p>
        {domains.length > 0 ? (
          <DomainPicker
            domains={domains}
            value={form.primaryDomain}
            onChange={(key) => setForm((current) => ({ ...current, primaryDomain: key }))}
            name="settings-primary-domain"
          />
        ) : (
          <p className="meta">No tracks have content yet — your admin can publish a roadmap.</p>
        )}
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
            style={{ ...input, marginTop: 6 }}
          />
        </label>
        <p className="meta" style={{ marginTop: 6 }}>
          Your public profile lives at /u/{username.trim().toLowerCase() || "your-handle"}. Letters, numbers, hyphens and underscores.
        </p>
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
        {busy ? "Saving..." : "Save profile"}
      </button>
    </form>
  );
}
