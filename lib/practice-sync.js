import { fetchAccepted } from "@/lib/leetcode";
import {
  automaticSyncDue,
  retryDelay
} from "@/lib/practice-domain";
import { reconcilePracticeEvidence, recomputePracticeScore } from "@/lib/practice";

function cleanError(message) {
  return String(message || "Sync unavailable. Recorded progress is preserved.")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 250);
}

function normalizeConnection(row) {
  return {
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    username: row.leetcode_username,
    failures: Number(row.failures || 0),
    lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).getTime() : null,
    nextSyncAt: new Date(row.next_sync_at).getTime(),
    leaseUntil: new Date(row.lease_until).getTime(),
    active: row.active !== false
  };
}

async function claimConnection(sql, { tenantId, userId, now, manual }) {
  const cooldown = manual
    ? sql`AND (last_attempt_at IS NULL OR last_attempt_at <= ${new Date(now - 15 * 60_000)})`
    : sql`AND next_sync_at <= ${new Date(now)}
        AND (last_sync_at IS NULL OR last_sync_at <= ${new Date(now - 3_600_000)})`;
  const [row] = await sql`
    UPDATE practice_connections
    SET lease_until = ${new Date(now + 90_000)},
        last_attempt_at = ${new Date(now)},
        sync_state = 'syncing',
        updated_at = ${new Date(now)}
    WHERE tenant_id = ${tenantId}::uuid
      AND user_id = ${userId}
      AND active = true
      AND length(leetcode_username) > 0
      AND lease_until < ${new Date(now)}
      AND next_sync_at <= ${new Date(now)}
      ${cooldown}
    RETURNING *
  `;
  return row ? normalizeConnection(row) : null;
}

async function markFailure(sql, connection, message, now) {
  const failureCount = connection.failures + 1;
  const safeMessage = cleanError(message);
  await sql`
    UPDATE practice_connections
    SET next_sync_at = ${new Date(now + retryDelay(failureCount))},
        lease_until = 'epoch',
        failures = ${failureCount},
        sync_state = 'error',
        sync_error = ${safeMessage},
        updated_at = ${new Date(now)}
    WHERE tenant_id = ${connection.tenantId}::uuid
      AND user_id = ${connection.userId}
  `;
  return {
    status: "error",
    message: safeMessage,
    retryAfterMs: retryDelay(failureCount)
  };
}

async function recordSolveAndEvidence(tx, { connection, submission, now }) {
  const acceptedAt = new Date(submission.acceptedAt);
  const [question] = await tx`
    SELECT q.id, q.week_id, q.title,
           c.id AS correction_id, c.credited AS correction_credited
    FROM practice_questions q
    JOIN practice_weeks w ON w.id = q.week_id
    LEFT JOIN practice_corrections c
      ON c.tenant_id = q.tenant_id
     AND c.user_id = ${connection.userId}
     AND c.question_id = q.id
    WHERE q.tenant_id = ${connection.tenantId}::uuid
      AND q.slug = ${submission.slug}
      AND w.tenant_id = ${connection.tenantId}::uuid
      AND w.status = 'scheduled'
      AND ${acceptedAt} >= w.start_at
      AND ${acceptedAt} < w.end_at
      AND ${acceptedAt} <= ${new Date(now)}
    LIMIT 1
  `;
  if (!question) return { matched: false, credited: false };

  await tx`
    INSERT INTO practice_solves
      (tenant_id, user_id, question_id, external_id, slug, accepted_at)
    VALUES (
      ${connection.tenantId}::uuid,
      ${connection.userId},
      ${question.id}::uuid,
      ${submission.externalId},
      ${submission.slug},
      ${acceptedAt}
    )
    ON CONFLICT (tenant_id, user_id, question_id) DO UPDATE
      SET accepted_at = LEAST(practice_solves.accepted_at, EXCLUDED.accepted_at)
  `;

  if (question.correction_id) return { matched: true, credited: false };

  await reconcilePracticeEvidence({
    sql: tx,
    tenantId: connection.tenantId,
    userId: connection.userId,
    questionId: question.id,
    weekId: question.week_id,
    acceptedAt: submission.acceptedAt,
    source: "system",
    verifiedBy: "system:leetcode"
  });
  return { matched: true, credited: true };
}

async function performSync(sql, connection, { now, timeoutMs, fetchImpl }) {
  let result;
  try {
    result = await fetchAccepted(connection.username, connection.userId, {
      timeoutMs,
      fetchImpl,
      now
    });
  } catch (error) {
    return markFailure(sql, connection, error instanceof Error ? error.message : "Sync unavailable.", now);
  }
  if (!result.ok) {
    return markFailure(sql, connection, result.message, now);
  }

  try {
    let matched = 0;
    let credited = 0;
    await sql.begin(async (tx) => {
      for (const submission of result.submissions) {
        const outcome = await recordSolveAndEvidence(tx, { connection, submission, now });
        if (outcome.matched) matched += 1;
        if (outcome.credited) credited += 1;
      }
      if (credited > 0) {
        await recomputePracticeScore(tx, connection.tenantId, connection.userId);
      }
      await tx`
        UPDATE practice_connections
        SET last_sync_at = ${new Date(now)},
            next_sync_at = ${new Date(now + 15 * 60_000)},
            lease_until = 'epoch',
            failures = 0,
            sync_state = 'ready',
            sync_error = NULL,
            updated_at = ${new Date(now)}
        WHERE tenant_id = ${connection.tenantId}::uuid
          AND user_id = ${connection.userId}
      `;
    });
    return {
      status: "ready",
      received: result.submissions.length,
      matched,
      credited,
      message: "Recent accepted submissions checked. Older activity may require an admin correction."
    };
  } catch (error) {
    return markFailure(
      sql,
      connection,
      error instanceof Error ? error.message : "Sync could not be saved. Recorded progress is preserved.",
      now
    );
  }
}

async function startRun(sql, tenantId, kind, now) {
  const [row] = await sql`
    INSERT INTO practice_sync_runs (tenant_id, kind, started_at)
    VALUES (${tenantId}::uuid, ${kind}, ${new Date(now)})
    RETURNING id
  `;
  return row?.id ?? null;
}

async function finishRun(sql, runId, { now, checked, successful, failed, errorSummary }) {
  if (!runId) return;
  await sql`
    UPDATE practice_sync_runs
    SET completed_at = ${new Date(now)},
        checked = ${checked},
        successful = ${successful},
        failed = ${failed},
        error_summary = ${errorSummary ? cleanError(errorSummary) : null}
    WHERE id = ${runId}::uuid
  `;
}

async function lastCompletedAutomaticRunAt(sql, tenantId) {
  const [row] = await sql`
    SELECT completed_at
    FROM practice_sync_runs
    WHERE tenant_id = ${tenantId}::uuid
      AND kind = 'automatic'
      AND completed_at IS NOT NULL
    ORDER BY started_at DESC
    LIMIT 1
  `;
  return row?.completed_at ? new Date(row.completed_at).getTime() : null;
}

export async function syncConnection(sql, {
  tenantId,
  userId,
  manual = false,
  now = Date.now(),
  timeoutMs = 12_000,
  fetchImpl = fetch
} = {}) {
  const kind = manual ? "manual" : "automatic";
  const runId = await startRun(sql, tenantId, kind, now);
  const connection = await claimConnection(sql, { tenantId, userId, now, manual });
  if (!connection) {
    const message = "Already syncing or cooling down. Please allow at least 15 minutes between refreshes.";
    await finishRun(sql, runId, {
      now: Date.now(),
      checked: 0,
      successful: 0,
      failed: 0,
      errorSummary: message
    });
    return { status: "skipped", message };
  }

  const result = await performSync(sql, connection, { now, timeoutMs, fetchImpl });
  await finishRun(sql, runId, {
    now: Date.now(),
    checked: 1,
    successful: result.status === "ready" ? 1 : 0,
    failed: result.status === "error" ? 1 : 0,
    errorSummary: result.status === "error" ? result.message : null
  });
  return result;
}

export async function syncDueConnections(sql, {
  limit = 10,
  now = Date.now(),
  timeoutMs = 8_000,
  fetchImpl = fetch
} = {}) {
  const dueRows = await sql`
    SELECT *
    FROM practice_connections
    WHERE active = true
      AND length(leetcode_username) > 0
      AND next_sync_at <= ${new Date(now)}
      AND lease_until < ${new Date(now)}
      AND (last_sync_at IS NULL OR last_sync_at <= ${new Date(now - 3_600_000)})
    ORDER BY next_sync_at ASC, user_id ASC
    LIMIT ${limit}
  `;
  const candidates = dueRows.map(normalizeConnection).filter((item) => automaticSyncDue(item, now));

  if (!candidates.length) {
    const tenants = await sql`
      SELECT DISTINCT tenant_id
      FROM practice_connections
      WHERE active = true AND length(leetcode_username) > 0
    `;
    let runsStarted = 0;
    for (const tenant of tenants) {
      const lastRunAt = await lastCompletedAutomaticRunAt(sql, tenant.tenant_id);
      if (lastRunAt && lastRunAt > now - 3_600_000) continue;
      const runId = await startRun(sql, tenant.tenant_id, "automatic", now);
      await finishRun(sql, runId, {
        now: Date.now(),
        checked: 0,
        successful: 0,
        failed: 0,
        errorSummary: null
      });
      runsStarted += 1;
    }
    return {
      checked: 0,
      successful: 0,
      failed: 0,
      remainingDue: 0,
      tenants: tenants.length,
      runsStarted
    };
  }

  const grouped = new Map();
  for (const connection of candidates) {
    const list = grouped.get(connection.tenantId) || [];
    list.push(connection);
    grouped.set(connection.tenantId, list);
  }

  let checked = 0;
  let successful = 0;
  let failed = 0;
  for (const [tenantId, connections] of grouped) {
    const runId = await startRun(sql, tenantId, "automatic", now);
    let runChecked = 0;
    let runSuccessful = 0;
    let runFailed = 0;
    const errors = [];
    for (const candidate of connections) {
      const claimed = await claimConnection(sql, {
        tenantId: candidate.tenantId,
        userId: candidate.userId,
        now,
        manual: false
      });
      if (!claimed) continue;
      runChecked += 1;
      const result = await performSync(sql, claimed, { now, timeoutMs, fetchImpl });
      if (result.status === "ready") runSuccessful += 1;
      else if (result.status === "error") {
        runFailed += 1;
        errors.push(result.message);
      }
    }
    checked += runChecked;
    successful += runSuccessful;
    failed += runFailed;
    await finishRun(sql, runId, {
      now: Date.now(),
      checked: runChecked,
      successful: runSuccessful,
      failed: runFailed,
      errorSummary: errors.length ? errors.join(" | ") : null
    });
  }

  const [{ remaining = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS remaining
    FROM practice_connections
    WHERE active = true
      AND length(leetcode_username) > 0
      AND next_sync_at <= ${new Date(now)}
      AND lease_until < ${new Date(now)}
      AND (last_sync_at IS NULL OR last_sync_at <= ${new Date(now - 3_600_000)})
  `;
  return { checked, successful, failed, remainingDue: Number(remaining), tenants: grouped.size };
}
