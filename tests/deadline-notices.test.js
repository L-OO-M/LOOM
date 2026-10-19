import { describe, expect, it } from "vitest";
import { MOU_REMINDER_DAYS, TASK_REMINDER_HOURS, mouNotice, taskNotice } from "@/lib/deadline-notices";

describe("deadline reminder windows", () => {
  it("warns about MoUs 30 days out and tasks 48 hours out", () => {
    expect(MOU_REMINDER_DAYS).toBe(30);
    expect(TASK_REMINDER_HOURS).toBe(48);
  });
});

describe("reminder copy", () => {
  it("names the partner and the date for a MoU", () => {
    const notice = mouNotice({ title: "Cloud credits", partner_name: "Acme", ends_on: "2026-11-01T00:00:00.000Z" });
    expect(notice.type).toBe("mou_expiring");
    expect(notice.title).toContain("Acme");
    expect(notice.body).toContain("Cloud credits");
    expect(notice.body).toContain("2026-11-01");
    expect(notice.link).toBe("/lead/mous");
  });

  it("names the task and its due date", () => {
    const notice = taskNotice({ title: "Book the auditorium", due_at: "2026-10-20T09:30:00.000Z" });
    expect(notice.type).toBe("event_task_due");
    expect(notice.title).toContain("Book the auditorium");
    expect(notice.body).toContain("2026-10-20");
    expect(notice.link).toBe("/lead/event-ops");
  });

  it("degrades gracefully when a date is missing", () => {
    expect(mouNotice({ title: "x", partner_name: "y" }).body).toContain("soon");
    expect(taskNotice({ title: "z" }).body).toContain("soon");
  });
});
