// Optional email verification, without a college-domain gate.
//
// Design decisions, because they are the whole point:
//
//   1. VERIFICATION IS OPTIONAL. NO account is blocked for being unverified.
//      Many colleges never issue student addresses, and the product is meant to
//      work across colleges, so an allowlist would exclude real members.
//
//   2. IT DOES NOT USE SUPABASE'S CONFIRMATION EMAIL. That depends on shared
//      SMTP with a rate limit that is not viable in production. Instead, when a
//      transactional provider is configured, this module mints its own
//      single-use token and sends one plain email through that provider.
//
//   3. IT IS PROVIDER-AGNOSTIC. Only Resend is implemented (a single fetch, no
//      dependency), but the token flow is independent of the sender: swapping in
//      Postmark or SES means replacing one function, not the schema.
//
//   4. TOKENS ARE HASHED. A database leak must not double as a set of working
//      verification links. The raw token exists only in the email.
import { createHash, randomBytes } from "node:crypto";
import { siteUrl } from "@/lib/seo";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function verificationConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function emailProviderName() {
  return verificationConfigured() ? "resend" : null;
}

export function hashToken(raw) {
  return createHash("sha256").update(String(raw)).digest("hex");
}

export function maskEmail(email) {
  const value = String(email || "");
  const [local, domain] = value.split("@");
  if (!local || !domain) return "your email";
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Mint a token and persist only its hash.
 *
 * Older unused tokens are marked used first, so a member who clicks "resend"
 * three times does not end up with three live links.
 */
export async function createVerificationToken({ sql, userId, tenantId, email }) {
  const raw = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await sql`
    UPDATE email_verification_tokens
    SET used_at = NOW()
    WHERE user_id = ${userId} AND used_at IS NULL
  `;
  await sql`
    INSERT INTO email_verification_tokens (user_id, tenant_id, email, token_hash, expires_at)
    VALUES (${userId}, ${tenantId ?? null}, ${String(email).toLowerCase()}, ${hashToken(raw)}, ${expiresAt})
  `;
  return { token: raw, expiresAt };
}

/** Consume a token exactly once and mark the profile verified. */
export async function consumeVerificationToken({ sql, raw }) {
  if (typeof raw !== "string" || raw.length < 32) {
    return { ok: false, reason: "invalid" };
  }
  const hash = hashToken(raw);
  const [row] = await sql`
    SELECT id, user_id, tenant_id, email, expires_at, used_at
    FROM email_verification_tokens
    WHERE token_hash = ${hash}
    LIMIT 1
  `;
  if (!row || row.used_at) return { ok: false, reason: "invalid" };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, reason: "expired" };

  await sql`
    UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ${row.id}::uuid
  `;
  await sql`
    UPDATE profiles
    SET email_verified_at = NOW(), email_verification_source = 'email'
    WHERE user_id = ${row.user_id}
  `;
  return { ok: true, userId: row.user_id, email: row.email };
}

/**
 * Send the verification link. Returns a result instead of throwing so the caller
 * can tell the member exactly what happened -- and never leaks the token.
 */
export async function sendVerificationEmail({ to, token, name }) {
  if (!verificationConfigured()) {
    return { ok: false, code: "NOT_CONFIGURED", message: "Email verification is not configured on this deployment." };
  }
  const link = `${siteUrl()}/api/auth/verify-email/confirm?token=${encodeURIComponent(token)}`;
  const greeting = name ? `Hi ${String(name).split(/\s+/)[0]},` : "Hi,";
  const text = [
    greeting,
    "",
    "Confirm this email address for your L.O.O.M. account:",
    link,
    "",
    "The link works once and expires in 24 hours. If you did not ask for this, ignore the email — nothing changes.",
    "",
    "L.O.O.M. does not require email verification to use your account.",
  ].join("\n");
  const html = `<p>${escapeHtml(greeting)}</p>
<p>Confirm this email address for your L.O.O.M. account:</p>
<p><a href="${link}">Confirm email</a></p>
<p>The link works once and expires in 24 hours. If you did not ask for this, ignore the email — nothing changes.</p>
<p style="color:#666">L.O.O.M. does not require email verification to use your account.</p>`;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [to],
        subject: "Confirm your L.O.O.M. email",
        text,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) {
      // Status only: the provider's body can echo request details.
      return { ok: false, code: `EMAIL_${res.status}`, message: "The email provider rejected the message." };
    }
    return { ok: true };
  } catch (error) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    return {
      ok: false,
      code: timeout ? "EMAIL_TIMEOUT" : "EMAIL_UNREACHABLE",
      message: timeout ? "The email provider did not answer in time." : "Could not reach the email provider.",
    };
  }
}
