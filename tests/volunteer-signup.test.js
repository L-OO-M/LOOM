import { afterEach, describe, expect, it, vi } from "vitest";

// P0-3 regression: the signup route used to lock a COUNT(*) aggregate with
// `FOR UPDATE`. PostgreSQL rejects that ("FOR UPDATE is not allowed with
// aggregate functions"), so every signup failed at runtime. These tests drive
// the real route against an in-memory SQL double that enforces the same rule,
// then exercise the capacity path that the slot lock is supposed to protect.

function makeDb({ slots, signups = [] }) {
  const queries = [];
  const rows = new Map(Object.entries(slots));
  const seatCount = (id) => signups.filter((s) => s.slot_id === id).length;

  function dispatch(strings, values, { inTx = false } = {}) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    queries.push(text);

    if (/SELECT \* FROM volunteer_slots WHERE id = \?.*LIMIT 1/.test(text)) {
      const slot = rows.get(values[0]);
      return slot ? [{ ...slot, id: values[0] }] : [];
    }

    if (/SELECT \* FROM volunteer_signups WHERE slot_id = \? AND user_id = \?/.test(text)) {
      const [slotId, userId] = values;
      const found = signups.find((s) => s.slot_id === slotId && s.user_id === userId);
      return found ? [{ ...found }] : [];
    }

    if (/SELECT capacity FROM volunteer_slots WHERE id = \? FOR UPDATE/.test(text)) {
      if (!inTx) throw new Error("slot lock must run inside a transaction");
      const slot = rows.get(values[0]);
      return slot ? [{ capacity: slot.capacity }] : [];
    }

    if (/COUNT\(\*\)/i.test(text)) {
      if (/FOR UPDATE/i.test(text)) {
        throw new Error("FOR UPDATE is not allowed with aggregate functions");
      }
      return [{ count: seatCount(values[0]) }];
    }

    if (/INSERT INTO volunteer_signups/.test(text)) {
      const [slotId, userId] = values;
      if (signups.some((s) => s.slot_id === slotId && s.user_id === userId)) return [];
      const row = { slot_id: slotId, user_id: userId };
      signups.push(row);
      return [{ ...row }];
    }

    throw new Error(`unexpected query: ${text}`);
  }

  const sql = (strings, ...values) => Promise.resolve(dispatch(strings, values));

  // Serialize transactions the way a row lock would: the second signup cannot
  // recount until the first transaction commits.
  let tail = Promise.resolve();
  sql.begin = (fn) => {
    const run = tail.then(() => {
      const tx = (strings, ...values) => Promise.resolve(dispatch(strings, values, { inTx: true }));
      return fn(tx);
    });
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
  sql.queries = queries;

  return { sql, signups };
}

const pendingContexts = [];
let route = null;

async function loadRoute() {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => pendingContexts.shift(),
    writeAudit: async () => {}
  }));
  return import("@/app/api/volunteers/[id]/signup/route");
}

function contextFor({ db, user, tenant = { id: "tenant-1" } }) {
  return { user, tenant, sql: db.sql };
}

async function signup({ db, user, tenant, id = "slot-1" }) {
  pendingContexts.push(contextFor({ db, user, tenant }));
  const { POST } = route || (route = await loadRoute());
  const response = await POST(
    new Request("http://localhost/api/volunteers/slot-1/signup", { method: "POST" }),
    { params: Promise.resolve({ id }) }
  );
  return { response, body: await response.json() };
}

describe("POST /api/volunteers/[id]/signup", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/auth-server");
    pendingContexts.length = 0;
    route = null;
  });

  it("succeeds for an open seat (reproduces the aggregate FOR UPDATE failure)", async () => {
    const db = makeDb({ slots: { "slot-1": { capacity: 2 } } });
    const { response, body } = await signup({ db, user: { id: "user-1" } });

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.signup).toMatchObject({ slot_id: "slot-1", user_id: "user-1" });
    expect(db.signups).toHaveLength(1);
  });

  it("never puts FOR UPDATE on the COUNT aggregate", async () => {
    const db = makeDb({ slots: { "slot-1": { capacity: 2 } } });
    await signup({ db, user: { id: "user-1" } });

    const countQuery = db.sql.queries.find((q) => /COUNT\(\*\)/i.test(q));
    expect(countQuery).toBeDefined();
    expect(countQuery).not.toMatch(/FOR UPDATE/i);
  });

  it("still locks the slot row before recounting, inside the transaction", async () => {
    const db = makeDb({ slots: { "slot-1": { capacity: 2 } } });
    await signup({ db, user: { id: "user-1" } });

    const lockAt = db.sql.queries.findIndex((q) => /FOR UPDATE/i.test(q));
    const countAt = db.sql.queries.findIndex((q) => /COUNT\(\*\)/i.test(q));
    expect(lockAt).toBeGreaterThan(-1);
    expect(countAt).toBeGreaterThan(lockAt);
  });

  it("rejects with EVENT_FULL when capacity is already taken", async () => {
    const db = makeDb({
      slots: { "slot-1": { capacity: 1 } },
      signups: [{ slot_id: "slot-1", user_id: "user-0" }]
    });
    const { response, body } = await signup({ db, user: { id: "user-1" } });

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("EVENT_FULL");
    expect(db.signups).toHaveLength(1);
  });

  it("cannot oversubscribe under concurrent signups for the last seat", async () => {
    const db = makeDb({ slots: { "slot-1": { capacity: 1 } } });
    route = await loadRoute();

    const [first, second] = await Promise.all([
      signup({ db, user: { id: "user-1" } }),
      signup({ db, user: { id: "user-2" } })
    ]);

    const results = [first, second];
    const statuses = results.map((r) => r.response.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(db.signups).toHaveLength(1);
    expect(results.find((r) => r.response.status === 409).body.error.code).toBe("EVENT_FULL");
  });

  it("keeps re-signup idempotent without touching capacity", async () => {
    const db = makeDb({
      slots: { "slot-1": { capacity: 1 } },
      signups: [{ slot_id: "slot-1", user_id: "user-1" }]
    });
    const { response, body } = await signup({ db, user: { id: "user-1" } });

    expect(response.status).toBe(200);
    expect(body.data.already).toBe(true);
    expect(db.sql.queries.some((q) => /COUNT\(\*\)/i.test(q))).toBe(false);
  });
});
