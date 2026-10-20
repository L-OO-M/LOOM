import { absoluteUrl } from "@/lib/seo";

// Crawler policy.
//
// Public pages are meant to be found by search engines *and* by AI answer
// engines -- a chapter's events and builder cards are useless if nobody can
// surface them. Private areas stay excluded for every crawler.
//
// The one policy choice that is genuinely a choice is training crawlers. The
// default here is to allow them, because exposure is the point for a student
// community. A chapter that disagrees can set AEO_BLOCK_TRAINING=1: assistant
// and search crawlers keep working, training-only crawlers are refused. That is
// reversible with an env var, not a code change.
const DISALLOW = ["/api/", "/admin", "/student", "/lead", "/login", "/register", "/setup", "/auth/"];
const ALLOW = [
  "/",
  "/about",
  "/faq",
  "/events",
  "/domains",
  "/verify/",
  "/u/",
  "/api/og/",
  // Public read-only endpoints are advertised in /llms.txt; the blanket
  // /api/ disallow below would otherwise contradict that. The more specific
  // allow wins under robots matching.
  "/api/public/",
  "/api/chapters",
  "/llms.txt",
  "/llms-full.txt",
];

const SEARCH_AND_ASSISTANTS = [
  "OAI-SearchBot", // ChatGPT search
  "ChatGPT-User", // ChatGPT browsing on a user's behalf
  "PerplexityBot",
  "Claude-SearchBot",
  "Claude-User",
  "Googlebot",
  "Bingbot",
  "Applebot",
  "DuckDuckBot",
];

const TRAINING_ONLY = [
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "meta-externalagent",
  "Bytespider",
  "Amazonbot",
  "cohere-ai",
];

export default function robots() {
  const blockTraining = process.env.AEO_BLOCK_TRAINING === "1";
  const rules = [
    {
      // `"/"` allows everything by default; the explicit entries document
      // intent for the surfaces that matter most. The Search Console
      // verification file at the root (/google<token>.html) is covered by it
      // and must stay fetchable -- Google fetches it anonymously.
      userAgent: "*",
      allow: ALLOW,
      disallow: DISALLOW,
    },
    ...SEARCH_AND_ASSISTANTS.map((userAgent) => ({ userAgent, allow: ALLOW, disallow: DISALLOW })),
    ...(blockTraining
      ? TRAINING_ONLY.map((userAgent) => ({ userAgent, disallow: ["/"] }))
      : TRAINING_ONLY.map((userAgent) => ({ userAgent, allow: ALLOW, disallow: DISALLOW }))),
  ];
  return {
    rules,
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
