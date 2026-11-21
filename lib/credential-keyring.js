import crypto from "node:crypto";
import { credentialSecret } from "./credentials";
import {
  buildCredentialPayload,
  canonicalJsonStringify,
  generateEd25519Keypair,
  signCertificate,
  signCertificateEd25519,
  verifyCertificateSignature
} from "./certificates";

function encryptionKey() {
  return crypto.createHash("sha256").update(credentialSecret()).digest();
}

export function encryptPrivateKey(privateKeyPem) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(privateKeyPem, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptPrivateKey(encrypted) {
  const [version, ivText, tagText, ciphertextText] = String(encrypted || "").split(".");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) {
    throw new Error("Unsupported encrypted signing key format");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export async function rotateTenantSigningKey(sql, { tenantId, actorId }) {
  const keyId = `ed25519-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
  const pair = generateEd25519Keypair();
  return sql.begin(async (tx) => {
    // Rotation deactivates the old signer but retains its public key for old credentials.
    await tx`
      UPDATE tenant_keyrings SET is_active = false
      WHERE tenant_id = ${tenantId}::uuid AND algorithm = 'Ed25519'
        AND is_active = true AND revoked_at IS NULL
    `;
    const [key] = await tx`
      INSERT INTO tenant_keyrings (
        tenant_id, key_id, algorithm, public_key_pem, private_key_pem_encrypted, is_active
      ) VALUES (
        ${tenantId}::uuid, ${keyId}, 'Ed25519', ${pair.publicKeyPem},
        ${encryptPrivateKey(pair.privateKeyPem)}, true
      ) RETURNING id, tenant_id, key_id, algorithm, public_key_pem, is_active, created_at
    `;
    await tx`
      INSERT INTO audit_logs (actor_id, tenant_id, action, resource, resource_id, after, metadata)
      VALUES (
        ${actorId}, ${tenantId}::uuid, 'credential_key.rotated', 'tenant_keyring',
        ${key.id}::text, ${tx.json({ keyId, algorithm: 'Ed25519' })},
        ${tx.json({ tenant_id: tenantId })}
      )
    `;
    return key;
  });
}

export async function revokeTenantSigningKey(sql, { tenantId, keyId, actorId, reason }) {
  if (!reason?.trim()) throw new Error("Key revocation requires a reason");
  return sql.begin(async (tx) => {
    const [key] = await tx`
      UPDATE tenant_keyrings
      SET is_active = false, revoked_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND key_id = ${keyId} AND revoked_at IS NULL
      RETURNING id, key_id, revoked_at
    `;
    if (!key) return null;
    await tx`
      INSERT INTO audit_logs (actor_id, tenant_id, action, resource, resource_id, reason, after, metadata)
      VALUES (
        ${actorId}, ${tenantId}::uuid, 'credential_key.revoked', 'tenant_keyring',
        ${key.id}::text, ${reason}, ${tx.json({ keyId })}, ${tx.json({ tenant_id: tenantId })}
      )
    `;
    return key;
  });
}

export async function signCertificateForTenant(sql, fields) {
  const [key] = await sql`
    SELECT key_id, private_key_pem_encrypted
    FROM tenant_keyrings
    WHERE tenant_id = ${fields.tenantId}::uuid AND algorithm = 'Ed25519'
      AND is_active = true AND revoked_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `;
  if (!key?.private_key_pem_encrypted) {
    return {
      credentialVersion: 1,
      algorithm: "HMAC-SHA256",
      keyId: null,
      payload: null,
      signature: signCertificate(fields)
    };
  }
  const signed = signCertificateEd25519({
    ...fields,
    privateKeyPem: decryptPrivateKey(key.private_key_pem_encrypted),
    keyId: key.key_id
  });
  return {
    credentialVersion: 2,
    algorithm: signed.algorithm,
    keyId: signed.keyId,
    payload: signed.payload,
    signature: signed.signature
  };
}

export async function verifyStoredCertificate(sql, cert) {
  if (!cert || cert.revoked_at) return false;
  if (cert.expires_at && new Date(cert.expires_at).getTime() <= Date.now()) return false;
  if ((cert.credential_version || 1) === 1) return verifyCertificateSignature(cert);
  if (cert.algorithm !== "Ed25519" || !cert.key_id) return false;
  const [key] = await sql`
    SELECT public_key_pem, revoked_at FROM tenant_keyrings
    WHERE tenant_id = ${cert.tenant_id}::uuid AND key_id = ${cert.key_id}
    LIMIT 1
  `;
  if (!key || key.revoked_at) return false;
  const expectedPayload = buildCredentialPayload({
    id: cert.id,
    studentId: cert.student_id,
    tenantId: cert.tenant_id,
    eventId: cert.event_id,
    issuedAt: cert.issued_at,
    keyId: cert.key_id
  });
  if (canonicalJsonStringify(cert.signed_payload) !== canonicalJsonStringify(expectedPayload)) return false;
  return verifyCertificateSignature({ ...cert, payload: expectedPayload }, {
    publicKeyPem: key.public_key_pem
  });
}
