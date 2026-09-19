import crypto from "node:crypto";

export function verifyGitHubSignature({ payload, signature, secret }) {
  if (!payload || !signature || !secret) return false;
  const hmac = crypto.createHmac("sha256", secret);
  const digest = `sha256=${hmac.update(payload).digest("hex")}`;
  if (Buffer.byteLength(digest) !== Buffer.byteLength(signature)) return false;

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

/**
 * Ingestion kill-switch. GitHub delivers webhooks automatically and
 * continuously — this flag decides whether the app acts on them. Fail-closed:
 * missing flag, missing table, or any error means PAUSED. Enable per chapter
 * in /admin/flags (github_integration). Ping deliveries are still acked so
 * GitHub can verify the URL while paused.
 */
export async function isGithubEnabled(sql, tenantId) {
  try {
    const [row] = await sql`
      SELECT enabled FROM feature_flags
      WHERE tenant_id = ${tenantId} AND key = 'github_integration' LIMIT 1
    `;
    return row?.enabled === true;
  } catch {
    return false;
  }
}

/**
 * Repository display name for a stored event. Webhook rows often have
 * repository_id NULL (older deliveries / job inserts), so prefer the
 * embedded payload copy before falling back to a joined name.
 * Never invents a name — returns null when nothing real exists.
 */
export function repoFullNameFromPayload(payload, fallback = null) {
  const fromPayload = payload?.repository?.full_name ?? payload?.repository?.name ?? null;
  if (typeof fromPayload === "string" && fromPayload.trim()) return fromPayload.trim();
  if (typeof fallback === "string" && fallback.trim()) return fallback.trim();
  return null;
}

/**
 * External link for a stored event, when the payload carries one.
 * Covers PRs, issues, and review comments. Returns null otherwise.
 */
export function eventUrlFromPayload(payload) {
  const candidates = [
    payload?.pull_request?.html_url,
    payload?.issue?.html_url,
    payload?.comment?.html_url,
    payload?.review?.html_url
  ];
  for (const u of candidates) {
    if (typeof u === "string" && u.startsWith("https://github.com/")) return u;
  }
  return null;
}

/**
 * Resolve a GitHub login to the owning student's user_id.
 * Case-insensitive across both the connection table and the profile
 * mirror (POST /api/github writes both). Returns null when unknown —
 * callers must skip aggregation rather than attribute to nobody.
 */
export async function resolveStudentIdByLogin(sql, login) {
  if (!login || typeof login !== "string") return null;
  try {
    const [hit] = await sql`
      SELECT user_id FROM github_connections
      WHERE lower(github_username) = lower(${login})
      LIMIT 1
    `;
    if (hit?.user_id) return hit.user_id;
    const [profile] = await sql`
      SELECT user_id FROM profiles
      WHERE lower(github_username) = lower(${login})
      LIMIT 1
    `;
    return profile?.user_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Contextual next-move for the GitHub workspace, derived ONLY from real
 * state. Pure/testable — the page passes counts, this picks the CTA.
 */
export function nextMoveState({ connected, eventCount = 0, pendingCount = 0, verifiedCount = 0 } = {}) {
  if (!connected) {
    return {
      kind: "connect",
      title: "Connect your GitHub account",
      body: "Save your username once and every push, pull request, and review starts flowing into your building record.",
      cta: "Link GitHub below",
      href: null
    };
  }
  if (pendingCount > 0) {
    return {
      kind: "pending",
      title: "A contribution is awaiting verification",
      body: `${pendingCount} claimed contribution${pendingCount === 1 ? " is" : "s are"} waiting on a merge. Once merged in a tracked repo it verifies automatically.`,
      cta: "Open Open Source",
      href: "/student/opensource"
    };
  }
  if (eventCount === 0) {
    return {
      kind: "first-push",
      title: "Push your next change",
      body: "Your account is linked but no activity has reached LOOM yet. Push to any watched repository and it will stream in here.",
      cta: "Open your GitHub profile",
      href: null // resolved on the page to https://github.com/{username}
    };
  }
  if (verifiedCount > 0) {
    return {
      kind: "keep-building",
      title: "Keep building your evidence",
      body: `${verifiedCount} verified contribution${verifiedCount === 1 ? "" : "s"} already back your story. The next merged PR in a curated repo adds another.`,
      cta: "Explore open-source opportunities",
      href: "/student/opensource"
    };
  }
  return {
    kind: "first-proof",
    title: "Turn activity into proof",
    body: "Activity is flowing. Open a pull request in a curated repository and claim it — merges verify automatically and earn badges.",
    cta: "Find a repository",
    href: "/student/opensource"
  };
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
