import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeGitHubEvent, verifyGitHubSignature } from "@/lib/github";

describe("github helpers", () => {
  it("verifies sha256 webhook signatures", () => {
    const payload = JSON.stringify({ action: "opened" });
    const secret = "dev-secret";
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;

    expect(verifyGitHubSignature({ payload, secret, signature })).toBe(true);
    expect(verifyGitHubSignature({ payload, secret, signature: "sha256=bad" })).toBe(false);
  });

  it("normalizes webhook payloads", () => {
    const event = normalizeGitHubEvent({
      eventName: "push",
      deliveryId: "delivery-1",
      payload: {
        ref: "refs/heads/main",
        commits: [{ id: "a" }, { id: "b" }],
        repository: { id: 123, full_name: "demo/app" },
        sender: { login: "aanya" }
      }
    });

    expect(event.idempotencyKey).toBe("push:delivery-1");
    expect(event.summary.commits).toBe(2);
    expect(event.repositoryName).toBe("demo/app");
  });
});
