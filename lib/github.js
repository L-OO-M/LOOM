import crypto from "node:crypto";

export function verifyGitHubSignature({ payload, signature, secret }) {
  if (!payload || !signature || !secret) return false;
  const hmac = crypto.createHmac("sha256", secret);
  const digest = `sha256=${hmac.update(payload).digest("hex")}`;
  if (Buffer.byteLength(digest) !== Buffer.byteLength(signature)) return false;

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export function normalizeGitHubEvent({ eventName, deliveryId, payload }) {
  const repository = payload.repository ?? {};
  const sender = payload.sender ?? {};

  return {
    idempotencyKey: `${eventName}:${deliveryId}`,
    eventName,
    deliveryId,
    repositoryId: repository.id?.toString() ?? null,
    repositoryName: repository.full_name ?? repository.name ?? null,
    actorLogin: sender.login ?? null,
    receivedAt: new Date().toISOString(),
    summary: summarizeGitHubEvent(eventName, payload)
  };
}

function summarizeGitHubEvent(eventName, payload) {
  if (eventName === "push") {
    return {
      commits: payload.commits?.length ?? 0,
      branch: payload.ref?.replace("refs/heads/", "") ?? null
    };
  }

  if (eventName === "pull_request") {
    return {
      action: payload.action,
      number: payload.pull_request?.number,
      merged: payload.pull_request?.merged ?? false
    };
  }

  if (eventName === "issues") {
    return {
      action: payload.action,
      number: payload.issue?.number
    };
  }

  return { action: payload.action ?? "received" };
}
