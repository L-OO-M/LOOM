// Symmetric encryption for secrets we must store and later read back.
//
// Why this file exists: a GitHub OAuth grant gives us a bearer token that is
// scoped to a student's repositories. Storing it means storing a live
// credential, and `lib/credentials.js` only does HMAC -- which signs but cannot
// encrypt. AES-256-GCM is the smallest correct tool: authenticated encryption,
// so a tampered ciphertext fails to decrypt rather than decrypting to garbage.
//
// FORMAT: `enc:v1:<iv>:<authTag>:<ciphertext>`, base64url, no padding.
//
// The `v1` segment is a key identifier, not decoration. Rotation is otherwise
// impossible: overwrite the key and every stored token becomes unreadable with
// no way to tell "rotated" from "corrupt" from "attacked". With a prefix we can
// tell exactly which tokens a key change would orphan, stage the new key, and
// re-seal lazily as rows are read.
//
// Everything here is pure and throws on misuse. A caller must not swallow these
// errors into a fallback -- "decryption failed, so treat the user as verified
// anyway" is the failure mode worth designing against.

import crypto from "node:crypto";
import { env } from "@/lib/env";

const ALGO = "aes-256-gcm";
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM's standard nonce size
const VERSION = "v1";

// Placeholders that must never be treated as a real key. Same reasoning as
// PLACEHOLDER_SECRETS in lib/env.js -- shipping a known key is worse than
// shipping none, because it looks configured.
const WEAK_KEYS = new Set([
  "dev-secret",
  "changeme",
  "change-me",
  "secret",
  "placeholder",
  "your-secret",
  "test",
  "password"
]);

function encryptionKey() {
  const raw = env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("[crypto] GITHUB_TOKEN_ENCRYPTION_KEY is not set — refusing to seal");
  }
  if (WEAK_KEYS.has(String(raw).trim().toLowerCase())) {
    throw new Error("[crypto] GITHUB_TOKEN_ENCRYPTION_KEY is a known placeholder — refusing to seal");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    // Failing on length rather than silently truncating is deliberate: a
    // 16-byte key would quietly be AES-128 and nothing would announce it.
    throw new Error(
      `[crypto] GITHUB_TOKEN_ENCRYPTION_KEY must be ${KEY_BYTES} bytes base64-encoded (got ${key.length}). ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  return key;
}

/** Is this process configured to seal at all? Safe to call in any environment. */
export function cryptoConfigured() {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt a plaintext string.
 * @returns {string} `enc:v1:<iv>:<tag>:<ciphertext>`
 */
export function seal(plaintext, aad = "loom.github_token") {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("[crypto] seal requires a non-empty string");
  }
  const key = encryptionKey();
  // A fresh IV per encryption. Reusing an IV with the same key destroys GCM's
  // guarantees, so this is never cached or derived.
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  // AAD binds the ciphertext to its purpose: a token sealed for GitHub cannot be
  // pasted into a column expecting something else and still open.
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "enc",
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(":");
}

/**
 * Decrypt a value produced by seal().
 *
 * Throws on every failure mode -- unknown version, wrong key, tampered
 * ciphertext, truncated input -- rather than returning something falsifiable.
 * A caller that wants to tolerate failure must decide so explicitly.
 */
export function open(sealed, aad = "loom.github_token") {
  if (typeof sealed !== "string" || !sealed) {
    throw new Error("[crypto] open requires a non-empty string");
  }
  const parts = sealed.split(":");
  if (parts.length !== 5 || parts[0] !== "enc") {
    throw new Error("[crypto] value is not a sealed envelope");
  }
  const [, version, ivB64, tagB64, dataB64] = parts;
  if (version !== VERSION) {
    // Surfaced distinctly because it means "rotate the key and re-seal", not
    // "this record is corrupt".
    throw new Error(`[crypto] unsupported envelope version "${version}" — a key rotation may be pending`);
  }
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  if (iv.length !== IV_BYTES) throw new Error("[crypto] malformed IV");
  const decipher = crypto.createDecipheriv(ALGO, encryptionKey(), iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** True when this envelope was sealed by a key other than the current one. */
export function isStaleEnvelope(sealed) {
  const parts = String(sealed || "").split(":");
  return !(parts.length === 5 && parts[0] === "enc" && parts[1] === VERSION);
}