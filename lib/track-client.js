/**
 * Browser side of first-party telemetry.
 *
 * Tiny on purpose: one queue-free POST per event, `keepalive` so the last view
 * still lands when the tab closes. Nothing here touches Supabase or identity —
 * the server derives tenant, user and role from the request.
 *
 * Opting out is three checks: the account toggle (localStorage mirror), Global
 * Privacy Control, and Do Not Track. Any of them stops the request at the
 * source, before it reaches the network.
 */
const OPTOUT_KEY = "loom-analytics-optout";
const SESSION_KEY = "loom-analytics-session";

export function analyticsEnabled() {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(OPTOUT_KEY) === "1") return false;
  } catch {
    return false;
  }
  if (navigator.globalPrivacyControl) return false;
  const dnt = navigator.doNotTrack || window.doNotTrack;
  if (dnt === "1" || dnt === "yes") return false;
  return true;
}

export function setAnalyticsOptOut(value) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(OPTOUT_KEY, "1");
    else window.localStorage.removeItem(OPTOUT_KEY);
  } catch {
    // Storage disabled: the server preference still stands.
  }
}

function sessionKey() {
  if (typeof window === "undefined") return null;
  try {
    let key = window.sessionStorage.getItem(SESSION_KEY);
    if (!key || !/^[A-Za-z0-9-]{8,64}$/.test(key)) {
      key = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(SESSION_KEY, key);
    }
    return key;
  } catch {
    return null;
  }
}

/**
 * @param {string} event allowlisted on the server
 * @param {{ path?: string, target?: string, metadata?: object }} [props]
 */
export function track(event, props = {}) {
  if (!analyticsEnabled()) return;
  const path = props.path || window.location.pathname;
  if (!path || path.startsWith("/api/") || path.startsWith("/_next/")) return;

  const body = JSON.stringify({
    events: [
      {
        event,
        path,
        target: props.target,
        metadata: props.metadata,
        sessionKey: sessionKey()
      }
    ]
  });

  try {
    fetch("/api/telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin"
    }).catch(() => {});
  } catch {
    // Analytics must never break navigation.
  }
}
