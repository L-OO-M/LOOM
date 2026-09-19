import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  eventUrlFromPayload,
  nextMoveState,
  normalizeGitHubEvent,
  repoFullNameFromPayload,
  verifyGitHubSignature
} from "@/lib/github";

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

  it("derives repository names from payloads before join fallbacks", () => {
    expect(repoFullNameFromPayload({ repository: { full_name: "demo/app" } }, "other/name")).toBe("demo/app");
    expect(repoFullNameFromPayload({}, "other/name")).toBe("other/name");
    expect(repoFullNameFromPayload({}, null)).toBeNull();
    expect(repoFullNameFromPayload(null, null)).toBeNull();
  });

  it("surfaces PR/issue links without inventing them", () => {
    expect(eventUrlFromPayload({ pull_request: { html_url: "https://github.com/demo/app/pull/3" } }))
      .toBe("https://github.com/demo/app/pull/3");
    expect(eventUrlFromPayload({ issue: { html_url: "https://github.com/demo/app/issues/9" } }))
      .toBe("https://github.com/demo/app/issues/9");
    expect(eventUrlFromPayload({})).toBeNull();
    expect(eventUrlFromPayload({ pull_request: { html_url: "https://evil.test/x" } })).toBeNull();
  });

  it("picks a contextual next move from real state only", () => {
    expect(nextMoveState({ connected: false }).kind).toBe("connect");
    expect(nextMoveState({ connected: true, eventCount: 0 }).kind).toBe("first-push");
    expect(nextMoveState({ connected: true, eventCount: 4, pendingCount: 1 }).kind).toBe("pending");
    expect(nextMoveState({ connected: true, eventCount: 4, verifiedCount: 2 }).kind).toBe("keep-building");
    expect(nextMoveState({ connected: true, eventCount: 4 }).kind).toBe("first-proof");
  });
});
