/**
 * Content-Security-Policy for LOOM, built once per request.
 *
 * This module is the ONLY place the policy is defined. `middleware.js` calls
 * `buildCsp()` for every request because the nonce has to be fresh; the static
 * CSP header was removed from `next.config.mjs` so a second, weaker policy
 * cannot drift and silently win over this one.
 *
 * Why a nonce: `script-src 'unsafe-inline'` lets any injected inline script run.
 * A per-request nonce is unguessable, so only the scripts Next itself renders
 * (which receive the nonce automatically from the CSP request header) execute.
 * Consequence, per Next's CSP guide: nonce-based CSP requires dynamic rendering
 * — see the `headers()` call in `app/layout.jsx`.
 */

/** Hosts allowed to be framed (Zen Mode YouTube embeds, lib/zen-embed.js). */
export const YOUTUBE_FRAME_HOSTS = [
  "'self'",
  "https://www.youtube-nocookie.com",
  "https://youtube-nocookie.com",
  "https://www.youtube.com",
  "https://youtube.com"
];

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Base64 of 18 random bytes = 24 characters, no padding. Encoded by hand so the
 * same code runs in the edge runtime (middleware) and in Node (vitest) without
 * relying on `btoa`/`Buffer` being present.
 */
export function createNonce() {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);

  let nonce = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    nonce += BASE64_ALPHABET[b0 >> 2];
    nonce += BASE64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    nonce += BASE64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)];
    nonce += BASE64_ALPHABET[b2 & 63];
  }
  return nonce;
}

/**
 * Build the policy string. `dev` adds `'unsafe-eval'`, which React/Next need for
 * eval-based debugging in development only; production never gets it.
 */
export function buildCsp({ nonce, dev = false } = {}) {
  if (!nonce) throw new Error("buildCsp() requires a nonce");

  // 'self' stays because Next loads page chunks from the same origin, including
  // the ones requested on client-side navigation. 'strict-dynamic' is
  // deliberately NOT used: it would drop 'self' and rely on dynamic propagation.
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "https://*.supabase.co"];
  if (dev) scriptSrc.push("'unsafe-eval'");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    // Kept: Next injects inline <style> blocks. Styles are not an XSS gadget in
    // this app, and nonce-ing them is out of scope for this change.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co",
    `frame-src ${YOUTUBE_FRAME_HOSTS.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join("; ");
}
