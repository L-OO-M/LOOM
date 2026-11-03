import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    // so this static set lives here. HSTS is unconditional: browsers ignore it
    // over plain HTTP per RFC 6797, and enforce it over HTTPS in production.
    //
    // Content-Security-Policy is deliberately NOT here. It needs a fresh nonce
    // per request, so middleware.js owns it (see lib/csp.js) and sets it on
    // every response it returns. Nothing that can execute script reaches the
    // browser without passing through middleware: its matcher only skips
    // _next/static, _next/image, favicon.ico, sitemap.xml, robots.txt and
    // static assets (images/fonts/css/js/txt/html). The only HTML document it
    // skips is the Search Console verification file, which carries no script.
    return [
      {
        source: "/(.*)",
        headers: [
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
