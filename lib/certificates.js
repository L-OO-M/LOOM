// Certificate authenticity.
//
// A verification code proves a row exists. It does not prove LOOM issued the
// row: anyone with database access, or a bug in an admin route, could insert a
// certificate that the public page would label "Verified — issued by L.O.O.M."
// The signature binds the immutable facts (id, holder, chapter, event, issue
// time) to a server secret, so a row edited after issuance stops verifying.
import crypto from "node:crypto";
import { credentialSecret } from "./credentials";

function issuedIso(issuedAt) {
  const d = new Date(issuedAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

export function signCertificate({ id, studentId, tenantId, eventId, issuedAt }) {
  const payload = [id, studentId, tenantId || "", eventId || "", issuedIso(issuedAt)].join(".");
  return crypto.createHmac("sha256", credentialSecret()).update(payload).digest("hex");
}

export function verifyCertificateSignature(cert) {
  if (!cert?.signature) return false;
  let expected;
  try {
    expected = signCertificate({
      id: cert.id,
      studentId: cert.student_id,
      tenantId: cert.tenant_id,
      eventId: cert.event_id,
      issuedAt: cert.issued_at
    });
  } catch {
    return false;
  }
  const got = String(cert.signature);
  if (Buffer.byteLength(expected) !== Buffer.byteLength(got)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}
