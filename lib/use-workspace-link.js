"use client";
import { useEffect, useState } from "react";
import { homeForRole } from "@/lib/auth";

export function useWorkspaceLink() {
  const [workspace, setWorkspace] = useState(null);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    async function update() {
      try {
        const stateResponse = await fetch("/api/auth/state", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!stateResponse.ok) return;
        const state = await stateResponse.json();
        if (!live || !state.ok || !state.data?.signedIn) return;
        const response = await fetch("/api/profile", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json();
        if (live && response.ok && body.ok)
          setWorkspace(homeForRole(body.data?.profile?.role));
      } catch {
        /* Auth links remain available when the profile cannot load. */
      }
    }
    void update();
    return () => {
      live = false;
      controller.abort();
    };
  }, []);
  return workspace;
}
