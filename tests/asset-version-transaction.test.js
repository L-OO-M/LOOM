import { afterEach, describe, expect, it, vi } from "vitest";

// Uploading a new version of a file asset is two writes: INSERT asset_versions
// then UPDATE media_assets.current_version. If the update failed, the version
// row used to survive while the asset still pointed at the old object — a
// dangling version that the download path would never reach. Both writes now
// share one transaction, and the uploaded object is removed on rollback.
const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const ASSET = "33333333-3333-4333-8333-333333333333";

const uploads = [];
const removals = [];
const audits = [];
const pendingContexts = [];

function makeDb({ failOn = null } = {}) {
  const state = { versions: [], currentVersion: 1, begins: 0, statements: [] };

  function dispatch(strings, values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    state.statements.push(text);
    if (failOn && failOn.test(text)) throw new Error("injected version failure");

    if (/INSERT INTO asset_versions/.test(text)) {
      state.versions.push({ asset_id: values[1], version: values[2], storage_path: values[3] });
      return [];
    }
    if (/UPDATE media_assets/.test(text)) {
      state.currentVersion = values[3];
      return [];
    }
    throw new Error(`unexpected query: ${text}`);
  }

  const sql = (strings, ...values) => Promise.resolve(dispatch(strings, values));
  sql.begin = async (fn) => {
    state.begins += 1;
    const snapshot = { versions: structuredClone(state.versions), currentVersion: state.currentVersion };
    try {
      return await fn((strings, ...values) => Promise.resolve(dispatch(strings, values)));
    } catch (e) {
      state.versions = snapshot.versions;
      state.currentVersion = snapshot.currentVersion;
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
  vi.doMock("@/lib/assets", () => ({
    getAsset: async () => ({ id: ASSET, storage_path: "assets/tenant/asset/v1/logo.png", current_version: 1 })
  }));
  vi.doMock("@/lib/storage", () => ({
    uploadObject: async (args) => { uploads.push(args); },
    removeObjects: async (path) => { removals.push(path); }
  }));
  vi.doMock("@/lib/auth-server", () => ({
    writeAudit: async (args) => { audits.push(args); }
  }));
  return import("@/app/api/lead/assets/[id]/versions/route");
}

async function uploadVersion(db) {
  pendingContexts.push({ user: { id: USER }, tenant: { id: TENANT }, sql: db.sql });
  const { POST } = await loadRoute();
  const form = new FormData();
  form.set("file", new Blob(["v2"], { type: "image/png" }), "logo-v2.png");
  return POST(new Request(`http://localhost/api/lead/assets/${ASSET}/versions`, { method: "POST", body: form }), {
    params: Promise.resolve({ id: ASSET })
  });
}

afterEach(() => {
  vi.doUnmock("@/lib/requirePermission");
  vi.doUnmock("@/lib/assets");
  vi.doUnmock("@/lib/storage");
  vi.doUnmock("@/lib/auth-server");
  uploads.length = 0;
  removals.length = 0;
  audits.length = 0;
  pendingContexts.length = 0;
});

describe("POST /api/lead/assets/[id]/versions", () => {
  it("commits the version row and the pointer update together", async () => {
    const db = makeDb();
    const response = await uploadVersion(db);

    expect(response.status).toBe(201);
    expect(db.state.begins).toBe(1);
    expect(db.state.versions).toHaveLength(1);
    expect(db.state.versions[0].version).toBe(2);
    expect(db.state.currentVersion).toBe(2);
    expect(audits).toHaveLength(1);
    expect(removals).toHaveLength(0);
  });

  it("rolls back the version row and removes the object when the pointer update fails", async () => {
    const db = makeDb({ failOn: /UPDATE media_assets/ });

    await expect(uploadVersion(db)).rejects.toThrow("injected version failure");

    expect(db.state.begins).toBe(1);
    expect(db.state.versions).toHaveLength(0);
    expect(db.state.currentVersion).toBe(1);
    expect(audits).toHaveLength(0);
    expect(removals).toHaveLength(1);
    expect(removals[0]).toBe(uploads[0].path);
  });
});
