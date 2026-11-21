// Durable outbox: enqueue a side effect inside the caller's transaction, let a
// cron drain run it later with retry and dead-lettering.
//
// Why not just await the side effect inline (like `notify()` does):
//   * `notify()` swallows its own errors, so a failed insert loses the
//     notification silently and the caller cannot tell;
//   * a slow or failing external call inside a request either delays the
//     response or is abandoned when the platform kills it;
//   * there is no place to record "we tried 6 times and gave up".
//
// The rule that makes this safe: `enqueue()` takes the caller's client, so it
// runs INSIDE the same transaction as the business write. Committing one commits
// both; rolling one back drops both. Do not enqueue after commit -- that is the
// window where the row exists and the event is lost.
//
// The authenticated jobs endpoint exposes `outbox-drain`; deployment operations
// must schedule it. Attendance now queues idempotent ranking recomputation here.
// Do not migrate a latency-sensitive side effect until that schedule is active,
// or the durable row will truthfully remain pending instead of being delivered.
//
// RLS CAVEAT for the drainer: `outbox` carries the standard fail-closed tenant
// policy, and this drain runs on the owner connection, which has rolbypassrls =
// true -- so policies are not evaluated today. When the RLS rollout moves
// request handling onto the NOBYPASSRLS app role, the drainer must NOT move with
// it: it reads every tenant's pending rows by design. It needs either the owner
// connection (as now) or a service path that can legitimately cross tenants.
import { createLogger } from "./log";
import { recomputeScore } from "./ranking";

const log = createLogger("outbox");

// Attempts are counted on claim, so `attempts === 1` on the first run.
export const MAX_ATTEMPTS = 8;
export const DEFAULT_BATCH = 25;
const STALE_LOCK_MINUTES = 5;
const MAX_ERROR_LENGTH = 500;

/**
 * Backoff for the next attempt: 1m, 2m, 4m, 8m, 16m, 32m, 1h, then capped at 1h.
 * Exponential so a flapping dependency is not hammered, capped so a transient
 * outage still recovers without operator action.
 */
export function retryDelaySeconds(attempts) {
  const n = Math.max(1, Number(attempts) || 1);
  return Math.min(60 * 2 ** (n - 1), 3600);
}

function errorText(err) {
  const message = err instanceof Error ? err.message : String(err ?? "unknown error");
  return message.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Queue one side effect. Pass the transaction client (`tx`) when the enqueue
 * belongs with a business write; pass the request client otherwise.
 *
 * `dedupeKey` makes a retried enqueue a no-op. Returns the new row id, or null
 * when the key was already queued/processed -- callers should treat null as
 * "already handled", not as a failure.
 */
export async function enqueue(sql, { tenantId, topic, payload = {}, dedupeKey = null, availableAt = null }) {
  if (!tenantId) throw new Error("[outbox] tenantId is required");
  if (!topic) throw new Error("[outbox] topic is required");

  const [row] = await sql`
    INSERT INTO outbox (tenant_id, topic, payload, dedupe_key, available_at)
    VALUES (
      ${tenantId},
      ${topic},
      ${sql.json(payload)},
      ${dedupeKey},
      COALESCE(${availableAt}::timestamptz, now())
    )
    ON CONFLICT (tenant_id, topic, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id
  `;
  return row ? row.id : null;
}

/**
 * Return rows whose drainer died mid-flight (locked but never finished) to the
 * queue. Without this a crash between claim and completion strands the row in
 * `processing` forever, which is a silent failure mode for exactly the work the
 * outbox exists to protect.
 */
export async function reclaimStale(sql, { minutes = STALE_LOCK_MINUTES } = {}) {
  return sql`
    UPDATE outbox
    SET status = 'pending', locked_at = NULL, lease_token = NULL
    WHERE status = 'processing'
      AND locked_at < now() - make_interval(mins => ${minutes})
    RETURNING id
  `;
}

/**
 * Take up to `limit` due rows. FOR UPDATE SKIP LOCKED is what makes concurrent
 * drains safe: a second drain steps over the rows this one already holds instead
 * of blocking on them or delivering them twice.
 */
export async function claimBatch(sql, { limit = DEFAULT_BATCH } = {}) {
  return sql`
    UPDATE outbox
    SET status = 'processing', locked_at = now(), lease_token = gen_random_uuid(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM outbox
      WHERE status = 'pending' AND available_at <= now()
      ORDER BY available_at ASC, id ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
}

async function markDone(sql, row) {
  const [updated] = await sql`
    UPDATE outbox
    SET status = 'done', completed_at = now(), locked_at = NULL,
        lease_token = NULL, last_error = NULL
    WHERE id = ${row.id} AND status = 'processing' AND lease_token = ${row.lease_token}::uuid
    RETURNING id
  `;
  return !!updated;
}

async function markRetry(sql, row, err) {
  const [updated] = await sql`
    UPDATE outbox
    SET status = 'pending',
        locked_at = NULL,
        lease_token = NULL,
        last_error = ${errorText(err)},
        available_at = now() + make_interval(secs => ${retryDelaySeconds(row.attempts)})
    WHERE id = ${row.id} AND status = 'processing' AND lease_token = ${row.lease_token}::uuid
    RETURNING id
  `;
  return !!updated;
}

async function markDead(sql, row, err) {
  const [updated] = await sql`
    UPDATE outbox
    SET status = 'dead', completed_at = now(), locked_at = NULL,
        lease_token = NULL, last_error = ${errorText(err)}
    WHERE id = ${row.id} AND status = 'processing' AND lease_token = ${row.lease_token}::uuid
    RETURNING id
  `;
  return !!updated;
}

/**
 * Topic handlers. Each receives (sql, row) and either resolves (done) or throws
 * (retry, then dead). Keep them idempotent: a retry re-runs the whole handler.
 */
export const OUTBOX_HANDLERS = Object.freeze({
  notification: async (sql, row) => {
    const { userId, type, title, body = null, link = null } = row.payload ?? {};
    if (!userId || !type || !title) {
      throw new Error("notification payload requires userId, type and title");
    }
    // Same conflict target as notifyOnce(): a duplicate delivery is a no-op.
    // CAUTION for future consumers: this reuses the outbox `dedupe_key` as the
    // notification key, and notifications dedupe on (user_id, dedupe_key). A
    // generic outbox key such as "webhook:123" is therefore fine across users,
    // but two different notifications for the SAME user would collide. Give the
    // enqueue an event-scoped key (e.g. "webhook:123:task-assigned") instead of
    // a delivery-scoped one.
    await sql`
      INSERT INTO notifications (tenant_id, user_id, type, title, body, link, dedupe_key)
      VALUES (
        ${row.tenant_id}, ${userId}, ${type}, ${title}, ${body}, ${link}, ${row.dedupe_key}
      )
      ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    `;
  },
  "ranking.recompute": async (sql, row) => {
    const { userId } = row.payload ?? {};
    if (!userId) {
      throw new Error("ranking.recompute payload requires userId");
    }
    // Keep the transaction-scoped advisory lock and the recomputation on the
    // same database connection. Acquiring this lock in an autocommit query
    // would release it before recomputeScore starts and provide no serialization.
    await sql.begin(async (tx) => {
      const [profile] = await tx`
        SELECT user_id FROM profiles
        WHERE user_id = ${userId} AND tenant_id = ${row.tenant_id}::uuid
        LIMIT 1
      `;
      if (!profile) {
        log.warn("skipping ranking.recompute: user not found in job tenant", {
          userId,
          tenantId: row.tenant_id
        });
        return;
      }

      const [lock] = await tx`
        SELECT pg_try_advisory_xact_lock(
          hashtextextended(${`${row.tenant_id}:${userId}`}, 0)
        ) AS acquired
      `;
      if (!lock?.acquired) {
        throw new Error("ranking.recompute: concurrent job for user, will retry");
      }
      await recomputeScore(tx, row.tenant_id, userId);
    });
  }
});

/**
 * Drain one batch. Safe to call concurrently (SKIP LOCKED) and safe to run when
 * the table is empty. Returns counts, never throws for a single bad row: one
 * poison message must not stop the queue.
 */
export async function drainOutbox(sql, { limit = DEFAULT_BATCH } = {}) {
  const reclaimed = await reclaimStale(sql);
  const claimed = await claimBatch(sql, { limit });

  const summary = {
    reclaimed: reclaimed.length,
    claimed: claimed.length,
    done: 0,
    retried: 0,
    dead: 0,
    lostLease: 0
  };

  for (const row of claimed) {
    const handler = OUTBOX_HANDLERS[row.topic];
    if (!handler) {
      if (await markDead(sql, row, `no handler for topic "${row.topic}"`)) summary.dead += 1;
      else summary.lostLease += 1;
      continue;
    }
    try {
      await handler(sql, row);
      if (await markDone(sql, row)) summary.done += 1;
      else summary.lostLease += 1;
    } catch (err) {
      if (row.attempts >= MAX_ATTEMPTS) {
        if (await markDead(sql, row, err)) summary.dead += 1;
        else summary.lostLease += 1;
        log.error("outbox row exhausted retries", { topic: row.topic, attempts: row.attempts, err });
      } else {
        if (await markRetry(sql, row, err)) summary.retried += 1;
        else summary.lostLease += 1;
        log.warn("outbox row scheduled for retry", { topic: row.topic, attempts: row.attempts, err });
      }
    }
  }

  return summary;
}

/**
 * Retention. Dead rows outlive successful ones on purpose: they are the
 * evidence for a side effect that never landed. Called from the existing
 * retention-prune job.
 */
export async function pruneOutbox(sql, { doneDays = 7, deadDays = 30 } = {}) {
  const exists = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'outbox'
  `;
  if (!exists.length) return { skipped: true };

  const done = await sql`
    DELETE FROM outbox
    WHERE status = 'done' AND completed_at < now() - make_interval(days => ${doneDays})
    RETURNING id
  `;
  const dead = await sql`
    DELETE FROM outbox
    WHERE status = 'dead' AND completed_at < now() - make_interval(days => ${deadDays})
    RETURNING id
  `;
  return { done: done.length, dead: dead.length, doneDays, deadDays };
}

export async function outboxHealth(sql, { tenantId = null, delayedMinutes = 10 } = {}) {
  const [summary] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
      COUNT(*) FILTER (
        WHERE status = 'pending'
          AND available_at < now() - make_interval(mins => ${delayedMinutes})
      )::int AS delayed,
      COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
      COUNT(*) FILTER (WHERE status = 'dead')::int AS dead,
      MIN(available_at) FILTER (WHERE status = 'pending') AS oldest_pending_at
    FROM outbox
    WHERE (${tenantId}::uuid IS NULL OR tenant_id = ${tenantId}::uuid)
  `;
  return {
    pending: summary?.pending ?? 0,
    delayed: summary?.delayed ?? 0,
    processing: summary?.processing ?? 0,
    dead: summary?.dead ?? 0,
    oldestPendingAt: summary?.oldest_pending_at ?? null,
    healthy: (summary?.delayed ?? 0) === 0 && (summary?.dead ?? 0) === 0
  };
}

export async function retryDeadOutboxRow(sql, { tenantId, id }) {
  const [row] = await sql`
    UPDATE outbox
    SET status = 'pending', attempts = 0, available_at = now(),
        locked_at = NULL, lease_token = NULL, completed_at = NULL, last_error = NULL
    WHERE id = ${id} AND tenant_id = ${tenantId}::uuid AND status = 'dead'
    RETURNING *
  `;
  return row || null;
}
