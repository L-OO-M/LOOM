import { describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ auth: { getUser: () => ({ data: { user: null }, error: null }) } })
}));

import { normalizeHost } from "@/lib/tenant";

describe("tenant resolution", () => {
  it("normalizes host names", () => {
    expect(normalizeHost("LOCALHOST:3000")).toBe("localhost");
    expect(normalizeHost("ABC.COLLEGE.EDU:443")).toBe("abc.college.edu");
  });
});