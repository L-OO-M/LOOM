"use client";
import { useEffect, useState } from "react";
import { homeForRole } from "@/lib/auth";

// The public chrome (header, hero, footer, 404) all need the same answer to
// "am I signed in, and where is my workspace?". Each hook instance used to fire
// its own /api/auth/state + /api/profile pair, so a single homepage view issued
// 4-8 round trips (doubled again by React StrictMode in development) -- each one
// an Auth0 session decrypt plus a database read. Under parallel load those
// probes queued behind the pool and took 20s+, which stalled the header and
// timed out page loads.
//
// Mounted instances now share ONE request. The request is aborted when the LAST
// subscriber unmounts, so a single consumer keeps the original "cancel on
// unmount" behaviour. Nothing is cached: once the request settles the slot is
// released and the next navigation fetches fresh state.
let shared = null;

function acquire() {
  if (!shared) {
    const controller = new AbortController();
    const entry = { controller, refs: 0, settled: false };
    entry.promise = (async () => {
      try {
        const stateResponse = await fetch("/api/auth/state", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!stateResponse.ok) return null;
        const state = await stateResponse.json();
        if (!state.ok || !state.data?.signedIn) return null;
        const response = await fetch("/api/profile", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return null;
        const body = await response.json();
        return body.ok ? homeForRole(body.data?.profile?.role) : null;
      } catch {
        /* Auth links remain available when the profile cannot load. */
        return null;
      }
    })();
    entry.promise.then(() => {
      entry.settled = true;
      if (shared === entry) shared = null;
    });
    shared = entry;
  }
  shared.refs += 1;
  return shared;
}

function release(entry) {
  entry.refs -= 1;
  if (entry.refs > 0 || entry.settled) return;
  if (shared === entry) shared = null;
  entry.controller.abort();
}

export function useWorkspaceLink() {
  const [workspace, setWorkspace] = useState(null);
  useEffect(() => {
    let live = true;
    const entry = acquire();
    entry.promise.then((value) => {
      if (live) setWorkspace(value);
    });
    return () => {
      live = false;
      release(entry);
    };
  }, []);
  return workspace;
}
