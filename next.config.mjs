import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZEN_SITE_ALLOWLIST } from "./lib/zen-embed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// frame-src lists every origin Zen Mode may embed. Without it, frame-src falls
// back to default-src 'self' and the browser refuses every external iframe
// before the site is ever consulted — which is why Zen showed blank stages for
// even the sites that permit framing. Derived from the single source of truth
// (ZEN_SITE_ALLOWLIST) so the two can never drift; youtube-nocookie is the only
// video origin Zen frames. `frame-ancestors 'none'` still forbids us being
// framed; this only widens what we may frame outwards.
const ZEN_FRAME_SRC = [
  "'self'",
  "https://www.youtube-nocookie.com",
  ...ZEN_SITE_ALLOWLIST.map((host) => `https://${host}`),
].join(" ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  typedRoutes: false,
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  async headers() {
    // Security headers for every response, including static files and
    // logged-out pages. Middleware cannot cover sitemap.xml, robots.txt, or
    // public assets (its matcher excludes them so they are never auth-gated),
    // so the static set lives here. HSTS is unconditional: browsers ignore it
    // over plain HTTP per RFC 6797, and enforce it over HTTPS in production.
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co; frame-src ${ZEN_FRAME_SRC}; frame-ancestors 'none'` },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
