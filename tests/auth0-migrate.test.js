import { describe, expect, it } from "vitest";
import {
  chunkRecords,
  displayNameForRow,
  isCompatibleBcryptHash,
  normalizeEmail,
  toAuth0ImportRecord
} from "@/load/auth0-migrate.mjs";

const BCRYPT_10 = "$2a$10$nFguVi9LsCAcvTZFKQlRKeLVydo8ETv483lkNsSFI/Wl1Rz1Ypo1K";

describe("Auth0 migration record building", () => {
  it("accepts only bcrypt cost 10 hashes", () => {
    expect(isCompatibleBcryptHash(BCRYPT_10)).toBe(true);
    expect(isCompatibleBcryptHash(BCRYPT_10.replace("$2a$", "$2b$"))).toBe(true);
    expect(isCompatibleBcryptHash(BCRYPT_10.replace("$2a$10$", "$2a$12$"))).toBe(false);
    expect(isCompatibleBcryptHash("$2y$10$nFguVi9LsCAcvTZFKQlRKeLVydo8ETv483lkNsSFI/Wl1Rz1Ypo1K")).toBe(false);
    expect(isCompatibleBcryptHash("")).toBe(false);
  });

  it("normalizes email and keeps the canonical Supabase id for traceability", () => {
    expect(normalizeEmail("  Ada@College.EDU ")).toBe("ada@college.edu");
    const { record, meta } = toAuth0ImportRecord({
      id: "5d1c2d3e-1111-4222-8333-444455556666",
      email: " Ada@College.EDU ",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      encrypted_password: BCRYPT_10,
      raw_user_meta_data: { name: "Ada Lovelace" }
    });
    expect(meta).toEqual({
      email: "ada@college.edu",
      compatiblePassword: true,
      requiresPasswordReset: false
    });
    expect(record).toEqual({
      email: "ada@college.edu",
      email_verified: true,
      user_id: "5d1c2d3e-1111-4222-8333-444455556666",
      password_hash: BCRYPT_10,
      name: "Ada Lovelace",
      app_metadata: { supabase_user_id: "5d1c2d3e-1111-4222-8333-444455556666" }
    });
  });

  it("omits an incompatible hash and marks the user for a password reset", () => {
    const { record, meta } = toAuth0ImportRecord({
      id: "user-1",
      email: "ada@college.edu",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      encrypted_password: "$2a$12$unsupported",
      raw_user_meta_data: {}
    }, { includeUserId: false });
    expect(record.password_hash).toBeUndefined();
    expect(record.user_id).toBeUndefined();
    expect(meta.requiresPasswordReset).toBe(true);
  });

  it("rejects rows without an email", () => {
    expect(toAuth0ImportRecord({ id: "user-1", email: null })).toEqual({
      record: null,
      meta: { reason: "missing_email" }
    });
  });

  it("falls back to given/family name metadata", () => {
    expect(displayNameForRow({ raw_user_meta_data: { given_name: "Ada", family_name: "Lovelace" } }))
      .toBe("Ada Lovelace");
  });

  it("splits records without losing any", () => {
    const records = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const chunks = chunkRecords(records, 1);
    expect(chunks).toEqual([[{ id: 1 }], [{ id: 2 }], [{ id: 3 }]]);
    expect(chunks.flat()).toHaveLength(3);
  });
});
