// Certificate authenticity.
//
// A verification code proves a row exists. It does not prove LOOM issued the
// row: anyone with database access, or a bug in an admin route, could insert a
// certificate that the public page would label "Verified — issued by LOOM"
// The signature binds the immutable facts (id, holder, chapter, event, issue
// time) to a server secret, so a row edited after issuance stops verifying.
import crypto from "node:crypto";
import { credentialSecret } from "./credentials";

function issuedIso(issuedAt) {
  const d = new Date(issuedAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

/**
 * Deterministic canonical JSON stringifier (keys sorted lexicographically, no whitespace).
 * Guarantees identical signed bytes across systems and runtimes.
 */
export function canonicalJsonStringify(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalJsonStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(obj[key])}`);
  return `{${pairs.join(",")}}`;
}

/**
 * Builds canonical versioned payload for Ed25519 credentials.
 */
export function buildCredentialPayload({ id, studentId, tenantId, eventId, issuedAt, keyId = "default" }) {
  return {
    algorithm: "Ed25519",
    credential_id: String(id),
    event_id: eventId ? String(eventId) : null,
    issued_at: issuedIso(issuedAt),
    issuer: tenantId ? String(tenantId) : null,
    key_id: String(keyId),
    subject: String(studentId),
    version: 2
  };
}

/**
 * Generate a new Ed25519 keypair for chapter credential signing.
 */
export function generateEd25519Keypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

/**
 * Asymmetric Ed25519 signing.
 */
export function signCertificateEd25519({ id, studentId, tenantId, eventId, issuedAt, privateKeyPem, keyId = "ed25519-v1" }) {
  const payloadObj = buildCredentialPayload({ id, studentId, tenantId, eventId, issuedAt, keyId });
  const canonicalBytes = Buffer.from(canonicalJsonStringify(payloadObj), "utf8");
  const signature = crypto.sign(null, canonicalBytes, privateKeyPem).toString("base64url");
  return {
    signature,
    keyId,
    algorithm: "Ed25519",
    payload: payloadObj
  };
}

/**
 * Asymmetric Ed25519 verification against a public key.
 */
export function verifyCertificateEd25519({ payload, signature, publicKeyPem }) {
  if (!signature || !publicKeyPem) return false;
  try {
    const canonicalBytes = Buffer.from(
      typeof payload === "string" ? payload : canonicalJsonStringify(payload),
      "utf8"
    );
    return crypto.verify(null, canonicalBytes, publicKeyPem, Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

/** Legacy v1 HMAC-SHA256 signer (maintained for backward compatibility). */
export function signCertificate({ id, studentId, tenantId, eventId, issuedAt }) {
  const payload = [id, studentId, tenantId || "", eventId || "", issuedIso(issuedAt)].join(".");
  return crypto.createHmac("sha256", credentialSecret()).update(payload).digest("hex");
}

/**
 * Universal certificate verification. Automatically routes to Ed25519 when
 * algorithm is Ed25519 or key_id is present, otherwise falls back to HMAC-SHA256.
 */
export function verifyCertificateSignature(cert, { publicKeyPem } = {}) {
  if (!cert?.signature) return false;

  // Route to Ed25519 if certificate specifies it
  if (cert.algorithm === "Ed25519" || cert.key_id) {
    if (!publicKeyPem) return false;
    const payload = cert.payload || buildCredentialPayload({
      id: cert.id,
      studentId: cert.student_id || cert.studentId,
      tenantId: cert.tenant_id || cert.tenantId,
      eventId: cert.event_id || cert.eventId,
      issuedAt: cert.issued_at || cert.issuedAt,
      keyId: cert.key_id || cert.keyId || "default"
    });
    return verifyCertificateEd25519({ payload, signature: cert.signature, publicKeyPem });
  }

  // Legacy HMAC-SHA256 path
  let expected;
  try {
    expected = signCertificate({
      id: cert.id,
      studentId: cert.student_id || cert.studentId,
      tenantId: cert.tenant_id || cert.tenantId,
      eventId: cert.event_id || cert.eventId,
      issuedAt: cert.issued_at || cert.issuedAt
    });
  } catch {
    return false;
  }
  const got = String(cert.signature);
  if (Buffer.byteLength(expected) !== Buffer.byteLength(got)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}
