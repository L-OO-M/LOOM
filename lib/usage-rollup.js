/**
 * Nightly usage rollup.
 *
 * Both the operator script (`load/rollup-usage.js`) and the cron endpoint
 * (`/api/jobs/run?job=usage-rollup`) call this, so the two cannot disagree about
 * which day they wrote or how a funnel is counted.
 *
 * Idempotency: a day is replaced, not appended. The delete and the inserts run
 * inside one transaction, so a rerun after a partial failure leaves the day
 * exactly as the second run computed it and never doubles a count.
 *
 * The reporting tables are the contract (migration 109): one row per
 * (chapter, day, workspace, route) and one row per (chapter, day, tour,
 * version). Raw rows stay available for 180 days (load/prune-retention.js), so
 * a missed rollup can always be re-derived inside that window.
 */
import { dayWindow } from "./usage.js";

/**
 * @param {import("postgres").Sql} sql owner connection: the rollup spans tenants
 * @param {{ days?: number, now?: Date, apply?: boolean }} [options]
 */
export async function rollupUsage(sql, { days = 1, now = new Date(), apply = true } = {}) {
  const window = Math.max(1, Math.min(180, Math.round(Number(days) || 1)));
  const dates = dayWindow(now, window);
  const result = { days: dates, pageViews: 0, routes: 0, tours: 0, applied: apply };

  for (const day of dates) {
    const [usageCount] = await sql`
      SELECT COUNT(*)::int AS n FROM page_views
      WHERE created_at >= ${day}::date AND created_at < (${day}::date + INTERVAL '1 day')
    `;
    const [tourCount] = await sql`
      SELECT COUNT(*)::int AS n FROM ui_events
      WHERE created_at >= ${day}::date AND created_at < (${day}::date + INTERVAL '1 day')
        AND event IN ('tour_start', 'tour_step', 'tour_complete', 'tour_skip')
    `;
    result.pageViews += usageCount?.n || 0;
    result.tours += tourCount?.n || 0;

    if (!apply) {
      result.routes += 0;
      continue;
    }

    const tours = await sql`
      SELECT tenant_id,
             COALESCE(metadata->>'tour', 'student') AS tour,
             COALESCE(CASE WHEN metadata->>'version' ~ '^[0-9]{1,2}$'
                           THEN (metadata->>'version')::int END, 1) AS version,
             COUNT(*) FILTER (WHERE event = 'tour_start')::int AS started,
             COUNT(*) FILTER (WHERE event = 'tour_complete')::int AS completed,
             COUNT(*) FILTER (WHERE event = 'tour_skip')::int AS skipped
      FROM ui_events
      WHERE created_at >= ${day}::date AND created_at < (${day}::date + INTERVAL '1 day')
        AND event IN ('tour_start', 'tour_step', 'tour_complete', 'tour_skip')
      GROUP BY tenant_id, tour, version
    `;

    const steps = await sql`
      SELECT tenant_id,
             COALESCE(metadata->>'tour', 'student') AS tour,
             COALESCE(CASE WHEN metadata->>'version' ~ '^[0-9]{1,2}$'
                           THEN (metadata->>'version')::int END, 1) AS version,
             (metadata->>'step')::int AS step,
             MAX(metadata->>'step_id') AS step_id,
             COUNT(*)::int AS reached
      FROM ui_events
      WHERE created_at >= ${day}::date AND created_at < (${day}::date + INTERVAL '1 day')
        AND event = 'tour_step'
        AND metadata->>'step' ~ '^[0-9]{1,3}$'
      GROUP BY tenant_id, tour, version, step
    `;

    const stepMap = new Map();
    for (const row of steps) {
      const key = `${row.tenant_id || "none"}|${row.tour}|${row.version}`;
      const list = stepMap.get(key) || [];
      list.push({ step: Number(row.step), id: row.step_id || null, reached: Number(row.reached) });
      stepMap.set(key, list);
    }

    await sql.begin(async (tx) => {
      await tx`DELETE FROM usage_daily WHERE day = ${day}::date`;
      await tx`DELETE FROM tour_daily WHERE day = ${day}::date`;

      await tx`
        INSERT INTO usage_daily (tenant_id, day, area, path, views, visitors, signed_in, sessions)
        SELECT tenant_id,
               ${day}::date,
               COALESCE(area, 'public'),
               path,
               COUNT(*)::int,
               COUNT(DISTINCT visitor_key)::int,
               COUNT(*) FILTER (WHERE user_id IS NOT NULL)::int,
               COUNT(DISTINCT session_key)::int
        FROM page_views
        WHERE created_at >= ${day}::date AND created_at < (${day}::date + INTERVAL '1 day')
        GROUP BY tenant_id, COALESCE(area, 'public'), path
      `;

      for (const row of tours) {
        const key = `${row.tenant_id || "none"}|${row.tour}|${row.version}`;
        const list = (stepMap.get(key) || []).sort((a, b) => a.step - b.step);
        await tx`
          INSERT INTO tour_daily (tenant_id, day, tour, version, started, completed, skipped, steps)
          VALUES (
            ${row.tenant_id}, ${day}::date, ${row.tour}, ${row.version},
            ${row.started}, ${row.completed}, ${row.skipped}, ${JSON.stringify(list)}::jsonb
          )
        `;
      }

      const [{ n } = { n: 0 }] = await tx`
        SELECT COUNT(*)::int AS n FROM usage_daily WHERE day = ${day}::date
      `;
      result.routes += n;
    });
  }

  return result;
}
