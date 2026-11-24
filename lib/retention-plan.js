/**
 * Retention windows, in one place.
 *
 * `load/prune-retention.js` (operator) and `lib/scheduler.js`
 * (`/api/jobs/run?job=retention-prune`) used to hold two copies of this list,
 * which is how `page_views` and `ui_events` were added to one and forgotten in
 * the other. One export, two callers.
 *
 * Windows are deliberately conservative: long enough that nothing a member
 * could still be shown is destroyed.
 */
export const RETENTION_PLAN = Object.freeze([
  // Raw webhook payloads. The derived aggregates (student_daily_activity,
  // ranking_events) are computed from these, so they must outlive them.
  { table: "github_events", column: "received_at", days: 90, readOnly: false, note: "raw webhook payloads" },
  // The chapter's record of who changed what.
  { table: "audit_logs", column: "created_at", days: 730, readOnly: false, note: "audit trail (2 years)" },
  { table: "notifications", column: "created_at", days: 180, readOnly: true, note: "read notifications only" },
  // Raw usage detail. The dashboard reads usage_daily / tour_daily, so the raw
  // rows only need to survive long enough to re-derive a missed rollup.
  { table: "page_views", column: "created_at", days: 180, readOnly: false, note: "raw page views" },
  { table: "ui_events", column: "created_at", days: 180, readOnly: false, note: "raw tour events" }
]);
