import { describe, expect, it } from "vitest";
import { loadSuccessionOverview } from "@/lib/succession";

const TENANT = "11111111-1111-4111-8111-111111111111";

function makeSql({ checklist = [], handovers = [], terms = [] } = {}) {
  const seen = [];
  const sql = (strings) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    seen.push(text);
    if (/FROM handover_checklists/.test(text)) return Promise.resolve(checklist);
    if (/FROM lead_handovers/.test(text)) return Promise.resolve(handovers);
    if (/FROM profiles p/.test(text)) return Promise.resolve(terms);
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
    expect(overview.items[1].flags).toEqual({ planner: false, eventOps: true, headSlot: false });
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
});
