// Verifiable credentials: HMAC-signed share links.
// Secret: CREDENTIAL_SECRET, falling back to the webhook secret (documented in .env).
import crypto from "node:crypto";
import { env } from "./env";

export function credentialSecret() {
  const secret = process.env.CREDENTIAL_SECRET || env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("[credentials] CREDENTIAL_SECRET (or GITHUB_WEBHOOK_SECRET) is not set — refusing to sign");
  }
  return secret;
}

export function signCredential({ id, studentId, type, issuedAt }) {
  return crypto
    .createHmac("sha256", credentialSecret())
    .update(`${id}.${studentId}.${type}.${issuedAt}`)
    .digest("hex");
}

export function verifyCredentialSignature({ id, studentId, type, issuedAt, signature }) {
  if (!id || !studentId || !type || !issuedAt || !signature) return false;
  const expected = signCredential({ id, studentId, type, issuedAt });
  if (Buffer.byteLength(expected) !== Buffer.byteLength(signature)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// Mirrors an earned OSS badge into the achievements ledger so it can be shared.
// Idempotent via the UNIQUE(student_id, badge_id, source_type, source_ref).
export async function recordOssAchievement({ sql, studentId, tenantId, badgeKey, projectUrl }) {
  const [{ count = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS count FROM student_achievements
    WHERE student_id = ${studentId} AND source_type = 'oss' AND source_ref = ${badgeKey}
  `;
  if (count > 0) return null;
  const [row] = await sql`
    INSERT INTO student_achievements (student_id, tenant_id, source_type, source_ref, level, evidence_url)
    VALUES (${studentId}, ${tenantId}, 'oss', ${badgeKey}, 'gold', ${projectUrl || null})
    ON CONFLICT DO NOTHING
    RETURNING *
  `;
  return row || null;
}
