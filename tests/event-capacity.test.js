import { afterEach, describe, expect, it, vi } from "vitest";

// Capacity is enforced inside one transaction that locks the event row, so two
// concurrent signups cannot both pass the seat check. These tests drive the real
// route against an in-memory SQL double that implements sql / sql.begin(tx),
// serializes transactions like a row lock, and rolls state back on failure.

function makeDb({ events, registrations = [], failOn = null }) {
  const state = {
    events: events.map((e) => ({ ...e })),
    registrations: registrations.map((r) => ({ ...r }))
  };
  const queries = [];

  const countSeats = (eventId) =>
    state.registrations.filter((r) => r.event_id === eventId && r.status !== "cancelled").length;

  function dispatch(strings, values, { inTx = false } = {}) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    queries.push(text);
    if (failOn && failOn(text, values)) throw new Error(`simulated failure: ${text}`);

    if (/^SELECT \* FROM events WHERE id = \? AND tenant_id = \?::uuid AND status IN \('upcoming', 'live', 'past'\) LIMIT 1 FOR UPDATE$/.test(text)) {
      if (!inTx) throw new Error("event lock must run inside a transaction");
      const [id, tenantId] = values;
      const event = state.events.find(
        (e) => e.id === id && e.tenant_id === tenantId && ["upcoming", "live", "past"].includes(e.status)
      );
      return event ? [{ ...event }] : [];
    }

    if (/^SELECT COUNT\(\*\)::int AS seats FROM event_registrations WHERE event_id = \? AND status <> 'cancelled'$/.test(text)) {
      if (!inTx) throw new Error("seat count must run inside the transaction");
      return [{ seats: countSeats(values[0]) }];
    }

    if (/^SELECT id FROM event_registrations WHERE event_id = \? AND student_id = \? AND status <> 'cancelled' LIMIT 1$/.test(text)) {
      const [eventId, studentId] = values;
      const found = state.registrations.find(
        (r) => r.event_id === eventId && r.student_id === studentId && r.status !== "cancelled"
      );
      return found ? [{ id: found.id }] : [];
    }

    if (/^INSERT INTO event_registrations/.test(text)) {
      const [eventId, studentId, code] = values;
      let row = state.registrations.find((r) => r.event_id === eventId && r.student_id === studentId);
      if (row) {
        row.status = "registered";
      } else {
        row = {
          id: `reg-${state.registrations.length + 1}`,
          event_id: eventId,
          student_id: studentId,
          status: "registered",
          check_in_code: code
        };
        state.registrations.push(row);
      }
      return [{ ...row }];
    }

    if (/^UPDATE event_registrations SET status = 'cancelled' WHERE event_id = \? AND student_id = \? AND status <> 'cancelled' RETURNING id$/.test(text)) {
      const [eventId, studentId] = values;
      const row = state.registrations.find(
        (r) => r.event_id === eventId && r.student_id === studentId && r.status !== "cancelled"
      );
      if (!row) return [];
      row.status = "cancelled";
      return [{ id: row.id }];
    }

    if (/^UPDATE events SET registered_count = \(SELECT COUNT\(\*\) FROM event_registrations WHERE event_id = \? AND status <> 'cancelled'\) WHERE id = \? AND tenant_id = \?::uuid$/.test(text)) {
      const [eventId, id, tenantId] = values;
      const event = state.events.find((e) => e.id === id && e.tenant_id === tenantId);
      if (!event) return [];
      event.registered_count = countSeats(eventId);
      return [];
    }

    throw new Error(`unexpected query: ${text}`);
  }

  const sql = (strings, ...values) => Promise.resolve(dispatch(strings, values));

  // Serialize transactions the way a FOR UPDATE row lock would: the next
  // transaction cannot recount until the current one commits or rolls back.
  let tail = Promise.resolve();
  sql.begin = (fn) => {
    const run = tail.then(async () => {
      const snapshot = {
        events: state.events.map((e) => ({ ...e })),
        registrations: state.registrations.map((r) => ({ ...r }))
      };
      const tx = (strings, ...values) => Promise.resolve(dispatch(strings, values, { inTx: true }));
      try {
        return await fn(tx);
      } catch (error) {
        state.events = snapshot.events;
        state.registrations = snapshot.registrations;
        throw error;
      }
    });
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
  sql.queries = queries;

  return { sql, state };
}

const pendingContexts = [];
const auditCalls = [];
const notifyCalls = [];
let route = null;

async function loadRoute() {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => pendingContexts.shift(),
    writeAudit: async (args) => {
      auditCalls.push(args);
    },
    notify: async (args) => {
      notifyCalls.push(args);
    }
  }));
  return import("@/app/api/events/[id]/route");
}

function event(over = {}) {
  return {
    id: "event-1",
    tenant_id: "tenant-1",
    title: "Systems Workshop",
    capacity: null,
    registered_count: 0,
    status: "upcoming",
    ...over
  };
}

function registration(over = {}) {
  return {
    id: `reg-${over.student_id || "student"}`,
    event_id: "event-1",
    student_id: "student-1",
    status: "registered",
    check_in_code: "LOOM-AAAAAAAA",
    ...over
  };
}

async function post({ db, user = { id: "student-1" }, id = "event-1", body = {} }) {
  pendingContexts.push({ user, tenant: { id: "tenant-1" }, sql: db.sql });
  const { POST } = route || (route = await loadRoute());
  const response = await POST(
    new Request("http://localhost/api/events/event-1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }),
    { params: Promise.resolve({ id }) }
  );
  return { response, body: await response.json() };
}

describe("POST /api/events/[id] capacity transaction", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/auth-server");
    pendingContexts.length = 0;
    auditCalls.length = 0;
    notifyCalls.length = 0;
    route = null;
  });

  it("rejects a new signup when the event is full", async () => {
    const db = makeDb({
      events: [event({ capacity: 1, registered_count: 1 })],
      registrations: [registration({ student_id: "student-0" })]
    });

    const { response, body } = await post({ db, user: { id: "student-1" } });

    expect(response.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("EVENT_FULL");
    expect(db.state.registrations).toHaveLength(1);
    expect(db.state.events[0].registered_count).toBe(1);
    expect(auditCalls).toHaveLength(0);
    expect(notifyCalls).toHaveLength(0);
  });

  it("keeps an existing registrant idempotent even when the event is full", async () => {
    const db = makeDb({
      events: [event({ capacity: 1, registered_count: 1 })],
      registrations: [registration({ student_id: "student-1" })]
    });

    const { response, body } = await post({ db, user: { id: "student-1" } });

    expect(response.status).toBe(200);
    expect(body.data.already).toBe(true);
    expect(body.data.registration).toBeUndefined();
    expect(db.state.registrations).toHaveLength(1);
    expect(db.state.registrations[0].status).toBe("registered");
    expect(db.state.events[0].registered_count).toBe(1);
    expect(auditCalls).toHaveLength(0);
    expect(notifyCalls).toHaveLength(0);
  });

  it("lets the last seat succeed and updates the counter in the same transaction", async () => {
    const db = makeDb({ events: [event({ capacity: 1 })] });

    const { response, body } = await post({ db, user: { id: "student-1" } });

    expect(response.status).toBe(201);
    expect(body.data.registration).toMatchObject({
      event_id: "event-1",
      student_id: "student-1",
      status: "registered"
    });
    expect(body.data.registration.check_in_code).toMatch(/^LOOM-[A-Z0-9]{8}$/);
    expect(db.state.registrations).toHaveLength(1);
    expect(db.state.events[0].registered_count).toBe(1);
    expect(auditCalls.map((a) => a.action)).toEqual(["registered_event"]);
    expect(notifyCalls).toHaveLength(1);
    expect(notifyCalls[0].title).toBe("Registered: Systems Workshop");
  });

  it("treats null, zero, and undefined capacity as unlimited", async () => {
    for (const capacity of [null, 0, undefined]) {
      const db = makeDb({
        events: [event({ capacity, registered_count: 3 })],
        registrations: [
          registration({ student_id: "student-a" }),
          registration({ student_id: "student-b" }),
          registration({ student_id: "student-c" })
        ]
      });

      const { response } = await post({ db, user: { id: "student-1" } });

      expect(response.status, `capacity=${capacity}`).toBe(201);
      expect(db.state.registrations).toHaveLength(4);
      expect(db.state.events[0].registered_count).toBe(4);
    }
  });

  it("recalculates registered_count inside the cancel transaction", async () => {
    const db = makeDb({
      events: [event({ capacity: 5, registered_count: 2 })],
      registrations: [
        registration({ student_id: "student-1" }),
        registration({ student_id: "student-2" })
      ]
    });

    const { response, body } = await post({
      db,
      user: { id: "student-1" },
      body: { action: "cancel" }
    });

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ cancelled: true });
    expect(db.state.registrations.find((r) => r.student_id === "student-1").status).toBe("cancelled");
    expect(db.state.registrations.find((r) => r.student_id === "student-2").status).toBe("registered");
    expect(db.state.events[0].registered_count).toBe(1);
    expect(auditCalls.map((a) => a.action)).toEqual(["cancelled_registration"]);
    expect(notifyCalls).toHaveLength(0);
  });

  it("keeps cancel idempotent without changing the counter", async () => {
    const db = makeDb({
      events: [event({ capacity: 5, registered_count: 0 })],
      registrations: [registration({ student_id: "student-1", status: "cancelled" })]
    });

    const { response, body } = await post({
      db,
      user: { id: "student-1" },
      body: { action: "cancel" }
    });

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ cancelled: false, already: true });
    expect(db.state.registrations[0].status).toBe("cancelled");
    expect(db.state.events[0].registered_count).toBe(0);
    expect(auditCalls).toHaveLength(0);
  });

  it("rolls back both the registration and the counter when a later statement fails", async () => {
    const db = makeDb({
      events: [event({ capacity: 5 })],
      failOn: (text) => text.startsWith("UPDATE events SET registered_count")
    });

    await expect(post({ db, user: { id: "student-1" } })).rejects.toThrow("simulated failure");

    expect(db.state.registrations).toHaveLength(0);
    expect(db.state.events[0].registered_count).toBe(0);
    expect(auditCalls).toHaveLength(0);
    expect(notifyCalls).toHaveLength(0);
  });
});
