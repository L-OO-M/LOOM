import { afterEach, describe, expect, it } from "vitest";
import {
  decryptPrivateKey,
  encryptPrivateKey
} from "@/lib/credential-keyring";
import {
  buildCredentialPayload,
  canonicalJsonStringify,
  generateEd25519Keypair,
  signCertificateEd25519,
  verifyCertificateEd25519
} from "@/lib/certificates";

const previousSecret = process.env.CREDENTIAL_SECRET;
afterEach(() => {
  if (previousSecret === undefined) delete process.env.CREDENTIAL_SECRET;
  else process.env.CREDENTIAL_SECRET = previousSecret;
});

describe("credential key lifecycle primitives", () => {
  it("encrypts private signing material with authenticated encryption", () => {
    process.env.CREDENTIAL_SECRET = "test-credential-secret-at-least-32-characters";
    const pair = generateEd25519Keypair();
    const encrypted = encryptPrivateKey(pair.privateKeyPem);
    expect(encrypted).not.toContain("PRIVATE KEY");
    expect(decryptPrivateKey(encrypted)).toBe(pair.privateKeyPem);
    expect(() => decryptPrivateKey(`${encrypted.slice(0, -2)}aa`)).toThrow();
  });

  it("signs canonical versioned payloads and rejects modified claims", () => {
    const pair = generateEd25519Keypair();
    const fields = {
      id: "credential-a",
      studentId: "student-a",
      tenantId: "tenant-a",
      eventId: "event-a",
      issuedAt: "2026-11-21T10:00:00.000Z",
      keyId: "key-a"
    };
    const signed = signCertificateEd25519({ ...fields, privateKeyPem: pair.privateKeyPem });
    expect(signed.payload).toEqual(buildCredentialPayload(fields));
    expect(verifyCertificateEd25519({
      payload: signed.payload,
      signature: signed.signature,
      publicKeyPem: pair.publicKeyPem
    })).toBe(true);
    expect(verifyCertificateEd25519({
      payload: { ...signed.payload, subject: "student-b" },
      signature: signed.signature,
      publicKeyPem: pair.publicKeyPem
    })).toBe(false);
  });

  it("canonicalizes object keys deterministically", () => {
    expect(canonicalJsonStringify({ b: 2, a: { z: 1, y: 0 } }))
      .toBe('{"a":{"y":0,"z":1},"b":2}');
  });
});
