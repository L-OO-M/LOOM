import { afterEach, describe, expect, it, vi } from "vitest";

// Creating a file asset is two inserts: media_assets and asset_versions. If the
// second fails the first used to survive (a row with no version), and the
// uploaded object had to be cleaned up by hand. The route now wraps both in one
// transaction; these tests drive the handler with a real multipart body.
const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

const uploads = [];
const removals = [];
const audits = [];
const pendingContexts = [];

function makeDb({ failOn = null } = {}) {
  const state = { assets: [], versions: [], begins: 0, statements: [] };

  function dispatch(strings, values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    state.statements.push(text);
    if (failOn && failOn.test(text)) throw new Error("injected asset failure");

    if (/INSERT INTO media_assets/.test(text)) {
      state.assets.push({ id: values[0], title: values[4], storage_path: values[7] });
      return [];
    }
    if (/INSERT INTO asset_versions/.test(text)) {
      state.versions.push({ asset_id: values[1], version: values[2], storage_path: values[3] });
      return [];
    }
    throw new Error(`unexpected query: ${text}`);
  }

  const sql = (strings, ...values) => Promise.resolve(dispatch(strings, values));
  sql.begin = async (fn) => {
    state.begins += 1;
    const snapshot = { assets: structuredClone(state.assets), versions: structuredClone(state.versions) };
    try {
      return await fn((strings, ...values) => Promise.resolve(dispatch(strings, values)));
    } catch (e) {
      state.assets = snapshot.assets;
      state.versions = snapshot.versions;
      throw e;
    }
  };
  return { sql, state };
}

async function loadRoute() {
  vi.resetModules();
  vi.doMock("@/lib/requirePermission", () => ({
    requireCan: async () => pendingContexts.shift(),
    toGuardResponse: () => null
  }));
  vi.doMock("@/lib/storage", () => ({
    uploadObject: async (args) => { uploads.push(args); },
    removeObjects: async (path) => { removals.push(path); }
  }));
  vi.doMock("@/lib/auth-server", () => ({
    writeAudit: async (args) => { audits.push(args); }
  }));
  return import("@/app/api/lead/assets/route");
}

async function uploadFile(db) {
  pendingContexts.push({ user: { id: USER }, tenant: { id: TENANT }, sql: db.sql });
  const { POST } = await loadRoute();
  const form = new FormData();
  form.set("title", "Brand logo");
  form.set("description", "Primary mark");
  form.set("kind", "image");
  form.set("file", new Blob(["hello"], { type: "image/png" }), "logo.png");
  return POST(new Request("http://localhost/api/lead/assets", { method: "POST", body: form }));
}

afterEach(() => {
  vi.doUnmock("@/lib/requirePermission");
  vi.doUnmock("@/lib/storage");
  vi.doUnmock("@/lib/auth-server");
  uploads.length = 0;
  removals.length = 0;
  audits.length = 0;
  pendingContexts.length = 0;
});

describe("POST /api/lead/assets (file)", () => {
  it("commits the asset row and its first version together", async () => {
    const db = makeDb();
    const response = await uploadFile(db);

    expect(response.status).toBe(201);
    expect(db.state.begins).toBe(1);
    expect(db.state.assets).toHaveLength(1);
    expect(db.state.versions).toHaveLength(1);
    expect(db.state.versions[0].asset_id).toBe(db.state.assets[0].id);
    expect(audits).toHaveLength(1);
    expect(removals).toHaveLength(0);
  });

  it("rolls back the asset row and removes the uploaded object when the version insert fails", async () => {
    const db = makeDb({ failOn: /INSERT INTO asset_versions/ });

    await expect(uploadFile(db)).rejects.toThrow("injected asset failure");

    expect(db.state.assets).toHaveLength(0);
    expect(db.state.versions).toHaveLength(0);
    expect(audits).toHaveLength(0);
    expect(removals).toHaveLength(1);
    expect(removals[0]).toBe(uploads[0].path);
  });
});
