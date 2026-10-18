// Deadline reminders: in-app nudges for MoUs about to lapse and ops tasks
// about to come due.
//
// WHY THIS EXISTS
// The MoU database and the event operations board both store a date that
// matters (mous.ends_on, event_ops_tasks.due_at) and both went live without
// anything that acted on it. A date nobody is reminded about is the same as no
// date. This job reads both tables and writes notifications, then marks the row
// so it will not warn twice.
//
// It runs on the OWNER connection on purpose: it sweeps every tenant, and the
// tenant RLS policies would otherwise hide every chapter but one. Same reasoning
// as load/prune-retention.js.
//
// Usage:
//   node load/remind-deadlines.js              # dry run: report, send nothing
//   node load/remind-deadlines.js --apply      # write notifications + markers
//
// Intended to be run on a schedule (e.g. hourly cron). Safe to run repeatedly:
// markers (mous.expiry_notified_at, event_ops_tasks.reminded_at) make it
// idempotent per row per date.
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";
import { MOU_REMINDER_DAYS, TASK_REMINDER_HOURS, mouNotice, taskNotice } from "../lib/deadline-notices.js";

const apply = process.argv.includes("--apply");

const sql = postgres(databaseUrl(), { max: 1, prepare: false });

let failed = false;

async function remindMous() {
  const rows = await sql`
    SELECT m.id, m.tenant_id, m.title, m.partner_name, m.ends_on, m.owner_id
    FROM mous m
    WHERE m.is_active
      AND m.status = 'active'
      AND m.ends_on IS NOT NULL
      AND m.ends_on <= (CURRENT_DATE + make_interval(days => ${MOU_REMINDER_DAYS}))
      AND m.expiry_notified_at IS NULL
      AND m.owner_id IS NOT NULL
  `;
  console.log(`MoUs ending within ${MOU_REMINDER_DAYS}d: ${rows.length}`);
  for (const mou of rows) {
    const notice = mouNotice(mou);
    console.log(`  ${apply ? "NOTIFY" : "would notify"}  ${mou.owner_id}  ${notice.title}`);
    if (!apply) continue;
    await sql`
      INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
      VALUES (${mou.tenant_id}, ${mou.owner_id}, ${notice.type}, ${notice.title}, ${notice.body}, ${notice.link})
    `;
    await sql`UPDATE mous SET expiry_notified_at = NOW() WHERE id = ${mou.id}`;
  }
  return rows.length;
}

async function remindTasks() {
  const rows = await sql`
    SELECT t.id, t.tenant_id, t.title, t.due_at, t.owner_id
    FROM event_ops_tasks t
    WHERE t.is_active
      AND t.status <> 'done'
      AND t.due_at IS NOT NULL
      AND t.due_at <= (NOW() + make_interval(hours => ${TASK_REMINDER_HOURS}))
      AND t.reminded_at IS NULL
      AND t.owner_id IS NOT NULL
  `;
  console.log(`Ops tasks due within ${TASK_REMINDER_HOURS}h: ${rows.length}`);
  for (const task of rows) {
    const notice = taskNotice(task);
    console.log(`  ${apply ? "NOTIFY" : "would notify"}  ${task.owner_id}  ${notice.title}`);
    if (!apply) continue;
    await sql`
      INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
      VALUES (${task.tenant_id}, ${task.owner_id}, ${notice.type}, ${notice.title}, ${notice.body}, ${notice.link})
    `;
    await sql`UPDATE event_ops_tasks SET reminded_at = NOW() WHERE id = ${task.id}`;
  }
  return rows.length;
}

try {
  console.log(apply ? "REMIND (applying)" : "REMIND (dry run — pass --apply to write)");
  console.log("");
  await remindMous();
  await remindTasks();
} catch (e) {
  console.error("remind failed:", e.message);
  failed = true;
} finally {
  await sql.end();
}

console.log("");
if (!apply) console.log("Dry run. Re-run with --apply to send these notifications.");
process.exit(failed ? 1 : 0);
