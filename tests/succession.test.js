import { describe, expect, it } from "vitest";
import { loadSuccessionOverview } from "@/lib/succession";

const TENANT = "11111111-1111-4111-8111-111111111111";

function makeSql({ checklist = [], handovers = [], terms = [], work = [] } = {}) {
  const seen = [];
  const sql = (strings) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    seen.push(text);
    if (/FROM handover_checklists/.test(text)) return Promise.resolve(checklist);
    if (/FROM lead_handovers/.test(text)) return Promise.resolve(handovers);
    if (/FROM profiles p/.test(text)) return Promise.resolve(terms);
    if (/FROM department_tasks/.test(text)) return Promise.resolve(work);
    throw new Error(`unexpected query: ${text}`);
  };
  return { sql, seen };
}

const past = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);

describe("loadSuccessionOverview", () => {
  it("merges checklist, briefs, flags and terms into one outstanding-first queue", async () => {
    const { sql, seen } = makeSql({
      checklist: [
        {
          id: "c1", title: "Sponsor contact sheet", category: "contacts", detail: "Hand over the sheet",
          done: false, owner_id: "u2", owner_name: "Ravi", department_name: "Events",
          department_id: "d1", created_at: "2026-01-01"
        },
        { id: "c2", title: "Old drive", category: "docs", detail: "", done: true, owner_id: "u3", owner_name: "Meera" }
      ],
      handovers: [
        {
          id: "h1", from_user_id: "u1", from_name: "Asha", to_user_id: "u9", to_name: "Dev",
          role: "dept_lead", department_name: "Events", status: "draft", brief: {},
          transfer_planner: false, transfer_event_ops: true, transfer_head_slot: false,
          from_term_end: null, updated_at: "2026-01-02"
        }
      ],
      terms: [
        {
          user_id: "u4", name: "Nina", role: "admin", role_term_end: past, is_founder: false
        },
        {
          user_id: "u5", name: "Founder", role: "admin", role_term_end: past, is_founder: true
        }
      ]
    });

    const overview = await loadSuccessionOverview({ sql, tenantId: TENANT });
    expect(seen).toHaveLength(3);
    expect(overview.items.map((item) => item.kind)).toEqual(["term", "handover", "checklist"]);
    expect(overview.items[0]).toMatchObject({ status: "expired", owner: { id: "u4", name: "Nina" } });
    expect(overview.items[1].outstanding).toEqual([
      "Brief: what the role owns",
      "Brief: what is in flight",
      "Not submitted for admin approval"
    ]);
    expect(overview.items[1].flags).toEqual({ planner: false, eventOps: true, headSlot: false, tasks: false });
    expect(overview.items[2].owner).toEqual({ id: "u2", name: "Ravi" });
    expect(overview.items.map((item) => item.id)).not.toContain("checklist:c2");
    expect(overview.summary).toMatchObject({
      checklist_total: 2,
      checklist_done: 1,
      checklist_outstanding: 1,
      handovers_open: 1,
      terms_expiring: 1,
      outstanding_items: 3
    });
  });

  it("labels an ownerless checklist item rather than dropping it", async () => {
    const { sql } = makeSql({
      checklist: [{ id: "c3", title: "Finance folder", category: "docs", detail: "", done: false, owner_id: null, owner_name: null }]
    });
    const overview = await loadSuccessionOverview({ sql, tenantId: TENANT });
    expect(overview.items).toHaveLength(1);
    expect(overview.items[0].owner).toEqual({ id: null, name: "Unassigned" });
  });

  it("names unowned department work, which a handover cannot reassign", async () => {
    const { sql } = makeSql({
      handovers: [
        {
          id: "h2", from_user_id: "u1", from_name: "Asha", to_user_id: "u9", to_name: "Dev",
          role: "dept_lead", department_id: "d1", department_name: "Events", status: "submitted",
          brief: { summary: "Owns the events calendar and the venue relationships.", responsibilities: "Two hackathons in flight." },
          transfer_planner: true, transfer_event_ops: true, transfer_head_slot: true, transfer_tasks: true,
          from_term_end: null, updated_at: "2026-01-02"
        }
      ],
      work: [
        { department_id: "d1", assignee_id: "u1", open: 4 },
        { department_id: "d1", assignee_id: null, open: 2 }
      ]
    });
    const overview = await loadSuccessionOverview({ sql, tenantId: TENANT });
    expect(overview.items[0].work).toEqual({ ownOpen: 4, unassigned: 2 });
    expect(overview.items[0].outstanding).toContain("2 open tasks have no owner");
  });

  it("does not flag a handover whose work is all owned", async () => {
    const { sql } = makeSql({
      handovers: [
        {
          id: "h3", from_user_id: "u1", from_name: "Asha", to_user_id: "u9", to_name: "Dev",
          role: "dept_lead", department_id: "d1", department_name: "Events", status: "submitted",
          brief: { summary: "Owns the events calendar and the venue relationships.", responsibilities: "Two hackathons in flight." },
          transfer_planner: true, transfer_event_ops: true, transfer_head_slot: true, transfer_tasks: true,
          from_term_end: null, updated_at: "2026-01-02"
        }
      ],
      work: [{ department_id: "d1", assignee_id: "u1", open: 4 }]
    });
    const overview = await loadSuccessionOverview({ sql, tenantId: TENANT });
    expect(overview.items[0].work).toEqual({ ownOpen: 4, unassigned: 0 });
    expect(overview.items[0].outstanding.join(" ")).not.toContain("no owner");
  });
});
