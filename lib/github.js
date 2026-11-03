import crypto from "node:crypto";

export function verifyGitHubSignature({ payload, signature, secret }) {
  if (!payload || !signature || !secret) return false;
  const hmac = crypto.createHmac("sha256", secret);
  const digest = `sha256=${hmac.update(payload).digest("hex")}`;
  if (Buffer.byteLength(digest) !== Buffer.byteLength(signature)) return false;

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

// ---------------------------------------------------------------------------
// Webhook delivery state
// ---------------------------------------------------------------------------
//
// The github_events row is the durable work item, not a dedupe marker. The
// webhook claims it, runs the fan-out, then marks it processed. These helpers
// are deliberately pure so the retry policy is testable without a database; the
// route applies the same rules in its claim/UPDATE statements.

export const GITHUB_EVENT_STATUS = Object.freeze({
  PENDING: "pending",
  PROCESSING: "processing",
  PROCESSED: "processed",
  FAILED: "failed",
  DEAD: "dead"
});

// A processor that dies mid-flight leaves status='processing'. Only after this
// lease may another delivery claim it, so two healthy requests never fan out the
// same delivery at once.
export const GITHUB_EVENT_LEASE_MS = 5 * 60 * 1000;

// Bounded retries: enough to ride out a transient database/GitHub failure,
// then stop rather than retrying a permanently malformed payload forever.
export const GITHUB_EVENT_MAX_ATTEMPTS = 6;

export function githubEventRetryDelayMs(attempts) {
  const n = Math.max(1, Number(attempts) || 1);
  return Math.min(60 * 60 * 1000, 30 * 1000 * 2 ** (n - 1));
}

export function githubEventNextAttemptAt(attempts, now = Date.now()) {
  return new Date(Number(now) + githubEventRetryDelayMs(attempts)).toISOString();
}

/**
 * Why a delivery that could not be claimed will not run right now.
 *
 * Returns: processed | dead | in_progress | retry_later | retryable.
 * `retryable` means the claim query raced another request between the UPDATE
 * and this read; the next redelivery may claim it.
 */
export function classifyGitHubDelivery(row, { now = Date.now(), leaseMs = GITHUB_EVENT_LEASE_MS } = {}) {
  const status = row?.status ?? GITHUB_EVENT_STATUS.PENDING;
  if (status === GITHUB_EVENT_STATUS.PROCESSED) return "processed";
  if (status === GITHUB_EVENT_STATUS.DEAD) return "dead";
  if (status === GITHUB_EVENT_STATUS.PROCESSING) {
    const claimedAt = row?.claimed_at ? new Date(row.claimed_at).getTime() : 0;
    return Number.isFinite(claimedAt) && now - claimedAt < leaseMs ? "in_progress" : "retryable";
  }
  if (status === GITHUB_EVENT_STATUS.FAILED) {
    const next = row?.next_attempt ? new Date(row.next_attempt).getTime() : 0;
    return Number.isFinite(next) && next > now ? "retry_later" : "retryable";
  }
  return "retryable";
}

/**
 * Stable notification key for retryable webhook fan-out.
 *
 * Prefer the durable object identity (canonical PR URL, project id) over the
 * delivery id: two hooks on one repository produce two DIFFERENT delivery ids
 * for the same merged PR, and both must still yield one notification.
 */
export function webhookNotificationKey(...parts) {
  const key = parts
    .filter((p) => p !== null && p !== undefined && String(p).trim() !== "")
    .map((p) => String(p).trim())
    .join(":");
  return key ? `github:${key}`.slice(0, 300) : null;
}

/**
 * Insert a notification at most once for a stable key.
 *
 * Mirrors lib/auth-server notify()'s best-effort contract (a notification must
 * never break the request), but uses the partial unique index from migration
 * 062 so a redelivered webhook cannot duplicate it.
 */
export async function notifyOnce({ sql, tenantId, userId, type, title, body = null, link = null, dedupeKey }) {
  if (!dedupeKey) throw new Error("[github] notifyOnce requires a dedupeKey");
  try {
    await sql`
      INSERT INTO notifications (tenant_id, user_id, type, title, body, link, dedupe_key)
      VALUES (${tenantId}, ${userId}, ${type}, ${title}, ${body}, ${link}, ${dedupeKey})
      ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    `;
  } catch {
    /* notifications must never break the request */
  }
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
 * Pass tenantId to keep attribution inside one chapter: a candidate from
 * another tenant is ignored and the tenant-scoped profile mirror is tried.
 */
export async function resolveStudentIdByLogin(sql, login, tenantId = null) {
  if (!login || typeof login !== "string") return null;
  try {
    // Ambiguity guard. A GitHub handle is globally unique, so more than one row
    // here means the handle is claimed twice in this database. Returning an
    // arbitrary one is how a real push ended up on the wrong member's ledger
    // (migration 035 adds the constraint that prevents this; the check stays so
    // a pre-existing duplicate degrades to "unattributed" rather than to
    // "attributed to the wrong person").
    const all = await sql`
      SELECT DISTINCT user_id FROM github_connections
      WHERE lower(github_username) = lower(${login})
    `;
    if (all.length > 1) {
      console.warn(
        `[github] ambiguous handle @${login}: claimed by ${all.length} accounts, refusing to attribute`
      );
      return null;
    }

    const [hit] = await sql`
      SELECT user_id FROM github_connections
      WHERE lower(github_username) = lower(${login})
      LIMIT 1
    `;
    if (hit?.user_id) {
      const [scoped] = await sql`
        SELECT user_id FROM profiles
        WHERE user_id = ${hit.user_id} AND tenant_id = ${tenantId}::uuid
        LIMIT 1
      `;
      if (scoped?.user_id) return scoped.user_id;
    }

    // Fail closed when the tenant is unknown.
    //
    // This used to fall back to an unscoped lookup (`SELECT ... WHERE
    // lower(github_username) = ...` with no tenant filter) whenever tenantId was
    // falsy. GitHub handles are globally unique but NOT globally owned: the same
    // login could belong to a member of any chapter, so that fallback resolved
    // an arbitrary chapter's student and wrote their activity ledger from it --
    // the same class of silent misattribution migration 035 was written to close.
    //
    // Attribution is worse than "no attribution": a wrong match credits real
    // numbers to the wrong person. Returning null records nothing.
    if (!tenantId) {
      console.warn(
        `[github] refusing to attribute @${login}: no tenant context, and an unscoped ` +
        `lookup could resolve to another chapter's student`
      );
      return null;
    }

    const [profile] = await sql`
      SELECT user_id FROM profiles
      WHERE lower(github_username) = lower(${login})
        AND tenant_id = ${tenantId}::uuid
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
