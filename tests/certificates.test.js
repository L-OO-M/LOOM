import { describe, expect, it } from "vitest";
import {
  signCertificate,
  verifyCertificateSignature,
  generateEd25519Keypair,
  signCertificateEd25519,
  verifyCertificateEd25519,
  canonicalJsonStringify
} from "@/lib/certificates";

// Signing takes camelCase arguments; verification takes the database row it is
// stored in, so the fixture carries both shapes.
const base = {
  id: "cert-1",
  studentId: "student-1",
  tenantId: "tenant-1",
  eventId: "event-1",
  issuedAt: "2026-01-02T03:04:05.000Z",
  student_id: "student-1",
  tenant_id: "tenant-1",
  event_id: "event-1",
  issued_at: "2026-01-02T03:04:05.000Z"
};

describe("certificate signatures", () => {
  it("accepts an untouched certificate", () => {
    const cert = { ...base, signature: signCertificate(base) };
    expect(verifyCertificateSignature(cert)).toBe(true);
  });

  it("rejects an edited holder, chapter, event or date", () => {
    const signature = signCertificate(base);
    expect(verifyCertificateSignature({ ...base, student_id: "student-2", signature })).toBe(false);
    expect(verifyCertificateSignature({ ...base, tenant_id: "tenant-2", signature })).toBe(false);
    expect(verifyCertificateSignature({ ...base, event_id: "event-2", signature })).toBe(false);
    expect(verifyCertificateSignature({ ...base, issued_at: "2026-01-02T03:04:06.000Z", signature })).toBe(false);
  });

  it("rejects missing and malformed signatures", () => {
    expect(verifyCertificateSignature({ ...base, signature: null })).toBe(false);
    expect(verifyCertificateSignature({ ...base, signature: "nope" })).toBe(false);
  });

  describe("Ed25519 asymmetric signatures", () => {
    it("produces deterministic canonical JSON regardless of object key order", () => {
      const a = { z: 1, a: 2, m: { y: 10, x: 20 } };
      const b = { a: 2, z: 1, m: { x: 20, y: 10 } };
      expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
      expect(canonicalJsonStringify(a)).toBe('{"a":2,"m":{"x":20,"y":10},"z":1}');
    });

    it("signs and verifies certificates with Ed25519 keypair", () => {
      const { publicKeyPem, privateKeyPem } = generateEd25519Keypair();
      const signed = signCertificateEd25519({ ...base, privateKeyPem, keyId: "test-key-1" });

      expect(signed.signature).toBeTruthy();
      expect(signed.algorithm).toBe("Ed25519");

      // Verify using verifyCertificateEd25519
      const ok = verifyCertificateEd25519({
        payload: signed.payload,
        signature: signed.signature,
        publicKeyPem
      });
      expect(ok).toBe(true);

      // Verify through universal verifyCertificateSignature
      const certRow = {
        ...base,
        algorithm: "Ed25519",
        key_id: "test-key-1",
        signature: signed.signature,
        payload: signed.payload
      };
      expect(verifyCertificateSignature(certRow, { publicKeyPem })).toBe(true);
    });

    it("rejects Ed25519 verification if payload was tampered with", () => {
      const { publicKeyPem, privateKeyPem } = generateEd25519Keypair();
      const signed = signCertificateEd25519({ ...base, privateKeyPem, keyId: "test-key-1" });

      const tamperedPayload = { ...signed.payload, subject: "impostor-student" };
      const ok = verifyCertificateEd25519({
        payload: tamperedPayload,
        signature: signed.signature,
        publicKeyPem
      });
      expect(ok).toBe(false);
    });

    it("rejects Ed25519 verification when verified with the wrong public key", () => {
      const keypair1 = generateEd25519Keypair();
      const keypair2 = generateEd25519Keypair();
      const signed = signCertificateEd25519({ ...base, privateKeyPem: keypair1.privateKeyPem });

      const ok = verifyCertificateEd25519({
        payload: signed.payload,
        signature: signed.signature,
        publicKeyPem: keypair2.publicKeyPem
      });
      expect(ok).toBe(false);
    });
  });
});
