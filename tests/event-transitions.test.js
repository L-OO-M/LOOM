import { describe, expect, it } from "vitest";
import {
  EVENT_STATUSES,
  EVENT_TRANSITIONS,
  decideEventTransition
} from "@/lib/event-transitions";

const baseEvent = {
  id: "evt-1",
  title: "AI Workshop",
  status: "draft",
  lock_version: 1,
  created_by: "user-organizer"
};

describe("event transitions FSM", () => {
  it("declares standard event statuses and transitions", () => {
    expect(EVENT_STATUSES).toContain("draft");
    expect(EVENT_STATUSES).toContain("submitted");
    expect(EVENT_STATUSES).toContain("published");
    expect(EVENT_STATUSES).toContain("completed");
    expect(EVENT_TRANSITIONS.draft).toEqual(["submitted", "cancelled"]);
  });

  it("permits valid linear progression by authorized roles", () => {
    // draft -> submitted
    const step1 = decideEventTransition({
      event: baseEvent,
      targetStatus: "submitted",
      actorId: "user-organizer",
      actorRole: "dept_lead",
      isOwningDeptLead: true
    });
    expect(step1.ok).toBe(true);
    expect(step1.patch.status).toBe("submitted");

    // submitted -> approved by admin
    const step2 = decideEventTransition({
      event: { ...baseEvent, status: "submitted" },
      targetStatus: "approved",
      actorId: "user-admin",
      actorRole: "admin",
      isAdmin: true
    });
    expect(step2.ok).toBe(true);
    expect(step2.patch.status).toBe("approved");

    // approved -> published
    const step3 = decideEventTransition({
      event: { ...baseEvent, status: "approved" },
      targetStatus: "published",
      actorId: "user-admin",
      actorRole: "admin",
      isAdmin: true
    });
    expect(step3.ok).toBe(true);

    // published -> live
    const step4 = decideEventTransition({
      event: { ...baseEvent, status: "published" },
      targetStatus: "live",
      actorId: "user-organizer",
      actorRole: "dept_lead",
      isOwningDeptLead: true
    });
    expect(step4.ok).toBe(true);

    // live -> completed
    const step5 = decideEventTransition({
      event: { ...baseEvent, status: "live" },
      targetStatus: "completed",
      actorId: "user-organizer",
      actorRole: "dept_lead",
      isOwningDeptLead: true
    });
    expect(step5.ok).toBe(true);
    expect(step5.patch.status).toBe("completed");
    expect(step5.patch.completed_by).toBe("user-organizer");
  });

  it("blocks illegal status skips", () => {
    // draft cannot skip straight to archived
    const r1 = decideEventTransition({
      event: baseEvent,
      targetStatus: "archived",
      actorId: "user-admin",
      isAdmin: true
    });
    expect(r1.ok).toBe(false);
    expect(r1.reason).toBe("INVALID_TRANSITION");

    // cancelled cannot become live
    const r2 = decideEventTransition({
      event: { ...baseEvent, status: "cancelled" },
      targetStatus: "live",
      actorId: "user-admin",
      isAdmin: true
    });
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe("INVALID_TRANSITION");
  });

  it("blocks unauthorized transitions", () => {
    // Student cannot approve an event
    const r = decideEventTransition({
      event: { ...baseEvent, status: "submitted" },
      targetStatus: "approved",
      actorId: "user-student",
      actorRole: "student"
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("FORBIDDEN");
  });

  it("handles optimistic concurrency lock conflicts", () => {
    const r = decideEventTransition({
      event: { ...baseEvent, lock_version: 2 },
      targetStatus: "submitted",
      actorId: "user-organizer",
      isOwningDeptLead: true,
      expectedVersion: 1
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("CONCURRENCY_CONFLICT");
  });
});
