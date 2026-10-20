import { describe, expect, it } from "vitest";
import { signCertificate, verifyCertificateSignature } from "@/lib/certificates";

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
});
