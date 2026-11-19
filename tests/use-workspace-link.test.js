// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { useWorkspaceLink } from "@/lib/use-workspace-link";

// lib/use-workspace-link.js is the only client hook in lib/ that decides which
// workspace a signed-in user is sent to. It resolves in two network steps
// (/api/auth/state then /api/profile), so the failure modes that matter are the
// ones a shallow render would miss: the signed-out short circuit, a profile
// that answers ok:false, a thrown fetch, and cleanup on unmount.
//
// These tests render the hook in a real DOM (jsdom) with a stubbed fetch and
// assert both the returned value and the request sequence.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function mount() {
  const seen = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  function Probe() {
    seen.push(useWorkspaceLink());
    return null;
  }
  act(() => {
    root.render(createElement(Probe));
  });
  return {
    latest: () => seen[seen.length - 1],
    renders: () => seen.length
  };
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

const SIGNED_IN = jsonResponse({ ok: true, data: { signedIn: true } });
const SIGNED_OUT = jsonResponse({ ok: true, data: { signedIn: false } });

function profileFor(role) {
  return jsonResponse({ ok: true, data: { profile: { role } } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useWorkspaceLink", () => {
  it("starts as null so the link never flashes a guessed workspace", () => {
    fetch.mockResolvedValue(jsonResponse({ ok: true, data: { signedIn: false } }));
    const probe = mount();
    expect(probe.latest()).toBeNull();
  });

  it("resolves an admin to /admin", async () => {
    fetch
      .mockResolvedValueOnce(SIGNED_IN)
      .mockResolvedValueOnce(profileFor("admin"));
    const probe = mount();

    await vi.waitFor(() => expect(probe.latest()).toBe("/admin"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("resolves a platform admin to /admin", async () => {
    fetch
      .mockResolvedValueOnce(SIGNED_IN)
      .mockResolvedValueOnce(profileFor("platform_admin"));
    const probe = mount();

    await vi.waitFor(() => expect(probe.latest()).toBe("/admin"));
  });

  it("resolves a department lead to /lead", async () => {
    fetch.mockResolvedValueOnce(SIGNED_IN).mockResolvedValueOnce(profileFor("dept_lead"));
    const probe = mount();

    await vi.waitFor(() => expect(probe.latest()).toBe("/lead"));
  });

  it("resolves a vertical lead to /lead", async () => {
    fetch
      .mockResolvedValueOnce(SIGNED_IN)
      .mockResolvedValueOnce(profileFor("vertical_lead"));
    const probe = mount();

    await vi.waitFor(() => expect(probe.latest()).toBe("/lead"));
  });

  it("resolves a student (and an unknown role) to /student", async () => {
    fetch.mockResolvedValueOnce(SIGNED_IN).mockResolvedValueOnce(profileFor("student"));
    const probe = mount();

    await vi.waitFor(() => expect(probe.latest()).toBe("/student"));
  });

  it("falls back to /student for a role it has never seen", async () => {
    fetch
      .mockResolvedValueOnce(SIGNED_IN)
      .mockResolvedValueOnce(profileFor("some_future_role"));
    const probe = mount();

    await vi.waitFor(() => expect(probe.latest()).toBe("/student"));
  });

  it("never fetches the profile when the visitor is signed out", async () => {
    fetch.mockResolvedValueOnce(SIGNED_OUT);
    const probe = mount();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[0][0]).toBe("/api/auth/state");
    expect(probe.latest()).toBeNull();
  });

  it("stays null when /api/auth/state answers non-2xx", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ ok: false }, { ok: false, status: 503 }));
    const probe = mount();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(probe.latest()).toBeNull();
  });

  it("stays null when the state envelope is ok:false", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ ok: false, error: { code: "NOPE" } }));
    const probe = mount();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(probe.latest()).toBeNull();
  });

  it("stays null when the profile answers non-2xx", async () => {
    fetch
      .mockResolvedValueOnce(SIGNED_IN)
      .mockResolvedValueOnce(jsonResponse({ ok: false }, { ok: false, status: 403 }));
    const probe = mount();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(probe.latest()).toBeNull();
  });

  it("stays null when the profile envelope is ok:false", async () => {
    fetch
      .mockResolvedValueOnce(SIGNED_IN)
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: { code: "TENANT_UNRESOLVED" } }));
    const probe = mount();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(probe.latest()).toBeNull();
  });

  it("swallows a network failure instead of throwing out of the effect", async () => {
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const probe = mount();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(probe.latest()).toBeNull();
    expect(probe.renders()).toBeGreaterThan(0);
  });

  it("swallows a JSON parse failure on the profile response", async () => {
    fetch.mockResolvedValueOnce(SIGNED_IN).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      }
    });
    const probe = mount();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(probe.latest()).toBeNull();
  });

  it("requests both endpoints with cache: no-store so a stale link cannot survive sign-out", async () => {
    fetch.mockResolvedValueOnce(SIGNED_IN).mockResolvedValueOnce(profileFor("admin"));
    mount();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    for (const [, options] of fetch.mock.calls) {
      expect(options).toMatchObject({ cache: "no-store" });
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("aborts the in-flight requests when the component unmounts", async () => {
    let resolveState;
    const pending = new Promise((resolve) => {
      resolveState = resolve;
    });
    fetch.mockReturnValueOnce(pending);
    mount();
    const { signal } = fetch.mock.calls[0][1];

    expect(signal.aborted).toBe(false);
    act(() => root.unmount());
    root = null;

    expect(signal.aborted).toBe(true);
    resolveState(SIGNED_OUT);
  });

  it("does not set state after unmount even if the response arrives late", async () => {
    let resolveState;
    const pending = new Promise((resolve) => {
      resolveState = resolve;
    });
    fetch.mockReturnValueOnce(pending);
    const probe = mount();
    const before = probe.renders();

    act(() => root.unmount());
    root = null;
    await act(async () => {
      resolveState(SIGNED_IN);
      await pending;
    });

    expect(probe.renders()).toBe(before);
  });
});
