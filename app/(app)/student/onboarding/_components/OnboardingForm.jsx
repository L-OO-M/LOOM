"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Github, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { normalizeDomainKey } from "@/lib/domains";
import { handleFromProfileUrl } from "@/lib/profileFolio";
import DomainPicker from "../../_components/DomainPicker";

// The onboarding surface.
//
// This is deliberately not the settings form with a different title. Onboarding
// is the one moment a member decides what the product is for them, so the track
// picker shows every available roadmap (with node counts) instead of a free-text
// field, the handle shows the URL it will create, and the save path reports the
// exact field that needs attention rather than "Request body is invalid".

const YEARS = [1, 2, 3, 4, 5, 6];

function Section({ index, title, note, children, id }) {
  return (
    <section aria-labelledby={id} className="border-t px-5 py-6 first:border-t-0 sm:px-7" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-baseline gap-3">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-[11px]"
          style={{ borderColor: "var(--line)", color: "var(--accent)" }}
          aria-hidden="true"
        >
          {index}
        </span>
        <div>
          <h2 id={id} className="text-base font-semibold tracking-tight" style={{ color: "var(--text)" }}>{title}</h2>
          {note && <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{note}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function OnboardingForm({ profile, domains, requireUsername = false, finishHref = null }) {
  const router = useRouter();
  const nameRef = useRef(null);
  const handleRef = useRef(null);

  const [form, setForm] = useState({
    name: profile?.name || "",
    department: profile?.department || "",
    year: profile?.year ?? null,
    enrollmentNumber: profile?.enrollment_number || "",
    primaryDomain: normalizeDomainKey(profile?.primary_domain) || domains[0]?.key || ""
  });
  const [card, setCard] = useState(null);
  const [security, setSecurity] = useState(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [field, setField] = useState(null);
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
    return () => { active = false; };
  }, []);

  function fail(message, target) {
    setError(message);
    setField(target || null);
    if (target === "name") nameRef.current?.focus();
    if (target === "username") handleRef.current?.focus();
  }

  async function saveIdentity() {
    const handle = username.trim().toLowerCase();
    // The card API refuses an avatar for anyone below lead, so only resend one
    // when this account is allowed to hold it. Sending null is always accepted.
    const photoRole = ["dept_lead", "vertical_lead", "admin", "platform_admin"].includes(
      profile?.effectiveRole || profile?.role
    );
    if (requireUsername && !handle) {
      fail("Claim a public handle before finishing onboarding.", "username");
      return false;
    }
    if (handle && handle !== card?.username) {
      const res = await fetch("/api/social/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: handle,
          bio: card?.bio || "",
          location: card?.location || null,
          avatarUrl: photoRole ? (card?.avatar_url || null) : null,
          github: handleFromProfileUrl("github", card?.social_links?.github),
          linkedin: card?.social_links?.linkedin || null,
          isPublic: card?.is_public ?? true,
          endorsementsVisible: card?.endorsements_visible
        })
      });
      const data = await res.json();
      if (!data.ok) {
        fail(data.error?.message || "Could not claim that handle. Try another.", "username");
        return false;
      }
      setCard(data.data.card);
    }

    if (password) {
      if (password.length < 8) {
        fail("Use at least 8 characters for your password.", "password");
        return false;
      }
      if (password !== confirmPassword) {
        fail("The passwords do not match.", "password");
        return false;
      }
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!data.ok) {
        fail(data.error?.message || "Could not set your password.", "password");
        return false;
      }
      setSecurity((current) => ({ ...(current || {}), hasPassword: true }));
      setPassword("");
      setConfirmPassword("");
    }

    return true;
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setField(null);

    if (!form.name.trim() || form.name.trim().length < 2) {
      fail("Tell us your name so your profile and certificates are right.", "name");
      setBusy(false);
      return;
    }

    const identityOk = await saveIdentity();
    if (!identityOk) {
      setBusy(false);
      return;
    }

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        enrollmentNumber: form.enrollmentNumber.trim() || null,
        department: form.department.trim() || null,
        year: form.year ?? null,
        primaryDomain: form.primaryDomain || null,
        onboardingCompleted: true
      })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      fail(data.error?.message || "Could not save your profile.", data.error?.details?.field || null);
      return;
    }

    if (finishHref) router.replace(finishHref);
    else router.refresh();
  }

  const inputStyle = {
    width: "100%",
    borderRadius: 10,
    border: "1px solid var(--line)",
    background: "var(--bg-muted)",
    color: "var(--text)",
    padding: "10px 12px",
    fontSize: 14
  };
  const labelStyle = { display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-muted)" };
  const canSetPassword = security?.auth0 && security?.managementConfigured && security?.hasPassword !== true;
  const passwordUnavailable = security?.auth0 && !security?.managementConfigured;
  const handlePreview = username.trim().toLowerCase() || "your-handle";

  return (
    <form
      onSubmit={submit}
      noValidate
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
    >
      {error && (
        <p role="alert" className="border-b px-5 py-3 text-sm sm:px-7" style={{ borderColor: "var(--line)", color: "var(--danger)", background: "var(--wash)" }}>
          {error}
        </p>
      )}

      <Section id="ob-track" index="01" title="Pick your track" note={domains.length > 0 ? `${domains.length} tracks have published roadmaps. This is the one that opens first — you can switch later.` : "Your chapter has not published a roadmap yet."}>
        {domains.length > 0 ? (
          <DomainPicker
            domains={domains}
            value={form.primaryDomain}
            onChange={(key) => setForm((current) => ({ ...current, primaryDomain: key }))}
          />
        ) : (
          <p className="rounded-xl border px-3.5 py-3 text-sm leading-6" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text-muted)" }}>
            No tracks are available yet, so there is nothing to pick. Save your details now and your
            roadmap appears as soon as an admin publishes one.
          </p>
        )}
      </Section>

      <Section id="ob-about" index="02" title="About you" note="Used on your profile, certificates and chapter roster.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2" style={labelStyle}>
            Full name
            <input
              ref={nameRef}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              autoComplete="name"
              minLength={2}
              maxLength={80}
              required
              aria-invalid={field === "name" || undefined}
              className="mt-1.5"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Branch
            <input
              value={form.department}
              onChange={(event) => setForm({ ...form, department: event.target.value })}
              placeholder="CSE, IT, ECE…"
              autoComplete="organization-title"
              maxLength={80}
              className="mt-1.5"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Enrollment number <span className="font-normal">(optional)</span>
            <input
              value={form.enrollmentNumber}
              onChange={(event) => setForm({ ...form, enrollmentNumber: event.target.value })}
              maxLength={40}
              className="mt-1.5"
              style={inputStyle}
            />
          </label>
        </div>

        <div className="mt-4">
          <p style={labelStyle}>Year</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Year of study">
            {YEARS.map((year) => {
              const selected = form.year === year;
              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, year: current.year === year ? null : year }))}
                  aria-pressed={selected}
                  className="min-w-10 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    borderColor: selected ? "var(--accent)" : "var(--line)",
                    background: selected ? "var(--accent)" : "transparent",
                    color: selected ? "var(--on-accent)" : "var(--text-muted)"
                  }}
                >
                  {year}
                </button>
              );
            })}
            <span className="meta ml-1">Tap again to clear</span>
          </div>
        </div>
      </Section>

      <Section id="ob-handle" index="03" title="Your public handle" note="One name for your profile, builder card and certificates.">
        <label style={labelStyle} htmlFor="ob-username">
          Handle
        </label>
        <div className="mt-1.5 flex items-stretch overflow-hidden rounded-[10px] border" style={{ borderColor: field === "username" ? "var(--danger)" : "var(--line)" }}>
          <span className="grid place-items-center px-3 font-mono text-xs" style={{ background: "var(--bg-muted)", color: "var(--text-muted)" }}>
            /u/
          </span>
          <input
            id="ob-username"
            ref={handleRef}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="aanya-dev"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            minLength={2}
            maxLength={30}
            required={requireUsername}
            aria-invalid={field === "username" || undefined}
            className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
            style={{ color: "var(--text)" }}
          />
          <span className="grid place-items-center pr-3 text-xs" style={{ color: "var(--text-muted)" }}>
            {username.trim() ? <Check size={14} aria-hidden="true" style={{ color: "var(--accent)" }} /> : null}
          </span>
        </div>
        <p className="meta mt-2 normal-case tracking-normal">
          Your page: <span className="font-mono">/u/{handlePreview}</span> — letters, numbers, hyphens, underscores.
        </p>
      </Section>

      <Section id="ob-signin" index="04" title="How you sign in" note="Your account already works. These are optional upgrades.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
              <Github size={15} aria-hidden="true" /> GitHub
            </p>
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
              {profile?.github_username ? `Linked as @${profile.github_username}.` : "Link a repository account so commits become evidence."}
            </p>
            <Link prefetch={false} href="/student/github" className="mt-2 inline-block text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
              {profile?.github_username ? "Manage GitHub →" : "Link GitHub →"}
            </Link>
          </div>

          <div className="rounded-xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
              <KeyRound size={15} aria-hidden="true" /> Email &amp; password
            </p>
            {!identityLoaded ? (
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Checking your sign-in methods…</p>
            ) : !security?.auth0 ? (
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>Managed by your current sign-in method.</p>
            ) : passwordUnavailable ? (
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>Password setup is not enabled on this deployment yet. Keep using your current method.</p>
            ) : security?.hasPassword ? (
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                Set. On the sign-in page choose <span className="font-semibold">Continue with email &amp; password</span>
                {security?.email ? <> and enter <span className="font-mono">{security.email}</span></> : null} — not
                &ldquo;Create an account&rdquo;, which tries to register a second one.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                  Optional: add one so you can sign in without a social provider.
                </p>
                {security?.email ? (
                  <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                    You will sign in as <span className="font-mono">{security.email}</span>.
                  </p>
                ) : null}
                {!showPassword ? (
                  <button type="button" onClick={() => setShowPassword(true)} className="mt-2 text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                    Add a password →
                  </button>
                ) : (
                  <div className="mt-2 grid gap-2">
                    {security?.emailVerified === false && (
                      <p className="text-xs" style={{ color: "var(--danger)" }}>Verify your email before adding a password.</p>
                    )}
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Password"
                      minLength={8}
                      autoComplete="new-password"
                      disabled={security?.emailVerified === false}
                      aria-label="Password"
                      style={inputStyle}
                    />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Confirm password"
                      minLength={8}
                      autoComplete="new-password"
                      disabled={security?.emailVerified === false}
                      aria-label="Confirm password"
                      style={inputStyle}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 sm:px-7" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
        <p className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <ShieldCheck size={14} aria-hidden="true" style={{ color: "var(--accent)" }} />
          Everything here can be changed later in Settings.
        </p>
        <button type="submit" disabled={busy} className="btn-ink justify-center" aria-busy={busy}>
          {busy ? (
            <>
              <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Saving
            </>
          ) : (
            <>
              {requireUsername ? "Finish onboarding" : "Save changes"} <ArrowRight size={15} aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
