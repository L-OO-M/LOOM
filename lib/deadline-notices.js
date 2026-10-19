/**
 * Deadline reminder copy — pure, so the reminder job and its tests share one
 * definition of what a nudge says.
 *
 * Used by load/remind-deadlines.js (P5). The windows here are the single source
 * of truth for "soon": a MoU that ends within 30 days, an ops task due within
 * 48 hours.
 */

export const MOU_REMINDER_DAYS = 30;
export const TASK_REMINDER_HOURS = 48;

function day(value) {
  if (!value) return "soon";
  return String(value).slice(0, 10);
}

export function mouNotice(mou) {
  return {
    type: "mou_expiring",
    title: `MoU ending soon: ${mou.partner_name}`,
    body: `“${mou.title}” with ${mou.partner_name} ends on ${day(mou.ends_on)}. Renew it or record the outcome.`,
    link: "/lead/mous"
  };
}

export function taskNotice(task) {
  return {
    type: "event_task_due",
    title: `Task due soon: ${task.title}`,
    body: `${task.title} is due ${day(task.due_at)}.`,
    link: "/lead/event-ops"
  };
}
