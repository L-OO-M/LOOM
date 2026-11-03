import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV === "development";

// script-src keeps 'unsafe-eval' only for the dev server (webpack eval-based
// source maps / HMR). Production builds do not need it, so it is omitted there.
const scriptSrc = ["'self'", "'unsafe-inline'", "https://*.supabase.co"];
if (isDev) scriptSrc.push("'unsafe-eval'");

// Fonts are self-hosted by next/font. StoryLoom passes loadFonts={false}, so no
// runtime Google Fonts request is needed or allowed.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co",
  "frame-src 'self' https://www.youtube-nocookie.com https://youtube-nocookie.com https://www.youtube.com https://youtube.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'"
].join("; ");

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
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
