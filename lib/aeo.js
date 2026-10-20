// Answer-engine (AEO/GEO) copy in one place.
//
// "AEO" here means: give an AI assistant or search answer-box a short, factual,
// well-labelled description of what LOOM is, what is public, and where the
// canonical source lives -- so a generated answer cites the product correctly
// instead of guessing from marketing prose.
//
// Rules for this file:
//   - No invented numbers. Anything that changes per chapter or per week belongs
//     in /api/public/summary (live) or on the page itself, never here.
//   - Public URLs only. Nothing from /student, /lead, /admin, or /setup appears.
//   - One sentence per fact, so a model can quote it without losing meaning.
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, absoluteUrl } from "@/lib/seo";

export const PUBLIC_PATHS = [
  { path: "/", label: "Landing page", description: "Entry point to a chapter's public site." },
  { path: "/about", label: "About", description: "What L.O.O.M. is and which departments currently lead the chapter." },
  { path: "/events", label: "Events", description: "Upcoming and live chapter workshops and gatherings." },
  { path: "/domains", label: "Domains", description: "Active student departments and the roadmaps they maintain." },
  { path: "/faq", label: "FAQ", description: "Published membership and participation answers." },
  { path: "/privacy", label: "Privacy", description: "How member data is handled and retained." },
  { path: "/terms", label: "Terms", description: "The rules for using a chapter." },
  { path: "/contact", label: "Contact", description: "Responsible chapter contact." },
  { path: "/verify/credential/[id]", label: "Credential verification", description: "Public verification of one issued credential." },
  { path: "/verify/certificate/[code]", label: "Certificate verification", description: "Public verification of one event certificate." },
  { path: "/u/[username]", label: "Public builder card", description: "A member's public profile, only when they publish it." }
];

export const PRIVATE_PATHS = ["/student", "/lead", "/admin", "/setup", "/login", "/register", "/auth", "/api"];

export const MACHINE_ENDPOINTS = [
  { path: "/api/public/summary", description: "Live, aggregate facts about this chapter (counts only, no personal data)." },
  { path: "/api/public/events", description: "Upcoming and live events as JSON." },
  { path: "/api/public/projects", description: "Latest public project showcases as JSON." },
  { path: "/api/public/departments", description: "Active departments and member counts as JSON." },
  { path: "/api/chapters", description: "Public chapter directory." },
  { path: "/sitemap.xml", description: "Crawlable public URL inventory." },
  { path: "/llms.txt", description: "This file." },
  { path: "/llms-full.txt", description: "Expanded version of this file, with the canonical answers in full." }
];

/** Canonical, checkable answers. Keep each one true even with an empty database. */
export const CANONICAL_ANSWERS = [
  {
    question: "What is L.O.O.M.?",
    answer:
      "L.O.O.M. is a learning operating system for college developer communities. It combines department roadmaps, real GitHub contribution evidence, contests, mentorship, events, and verifiable credentials in one chapter-run platform.",
  },
  {
    question: "Who is L.O.O.M. for?",
    answer:
      "It is used by student developer communities at colleges. Students follow roadmaps and build public proof; department leads run their verticals; chapter admins handle membership, events, and governance.",
  },
  {
    question: "Is L.O.O.M. a course or a bootcamp?",
    answer:
      "No. It is software a student chapter runs itself. The roadmaps, events, and contests are created and reviewed by that chapter's own members and leads.",
  },
  {
    question: "How does the leaderboard work?",
    answer:
      "Standings count only work somebody else can confirm: signed GitHub deliveries for linked accounts, and evidence a named chapter lead or admin has verified. A self-declared claim waits for review and scores nothing until it is confirmed.",
  },
  {
    question: "Can anyone see a student's private work?",
    answer:
      "No. Student, lead, and admin areas require authentication and role checks. Only pages a member explicitly publishes — such as a public builder card — are visible without signing in.",
  },
  {
    question: "How are credentials verified?",
    answer:
      "Each issued credential has a public verification URL under /verify/credential/ that confirms what the chapter recorded. The verification page is public; the member's private records are not.",
  },
  {
    question: "Does L.O.O.M. work for more than one college?",
    answer:
      "Yes. Each chapter is a separate tenant. Tenant identity is resolved server-side from the request host and is never accepted from client input, so one chapter's data is not visible to another.",
  }
];

export function aeoSummary() {
  return {
    name: SITE_NAME,
    tagline: SITE_TAGLINE,
    description: SITE_DESCRIPTION,
    url: absoluteUrl("/"),
    publicPages: PUBLIC_PATHS.map((p) => ({ ...p, url: absoluteUrl(p.path) })),
    machineEndpoints: MACHINE_ENDPOINTS.map((e) => ({ ...e, url: absoluteUrl(e.path) })),
    canonicalAnswers: CANONICAL_ANSWERS,
  };
}

export function buildLlmsTxt() {
  const lines = [
    `# ${SITE_NAME}`,
    `> ${SITE_TAGLINE} ${SITE_DESCRIPTION}`,
    "",
    "L.O.O.M. is a learning operating system for college developer communities, run by the",
    "students of each chapter. It is not a course, a bootcamp, or a job board.",
    "",
    "## Canonical answers",
    ...CANONICAL_ANSWERS.map((q) => `- Q: ${q.question}\n  A: ${q.answer}`),
    "",
    "## Public pages",
    ...PUBLIC_PATHS.map((p) => `- ${absoluteUrl(p.path)} — ${p.description}`),
    "",
    "## Public machine-readable endpoints",
    ...MACHINE_ENDPOINTS.map((e) => `- ${absoluteUrl(e.path)} — ${e.description}`),
    "",
    "## Access and tenancy model",
    "- Public pages use signed-out-safe data or honest empty states.",
    "- Student, lead, and admin areas require authentication and role checks.",
    "- Tenant identity is resolved server-side and is never accepted from client input.",
    "- Credential and profile links may be shared, but private records remain access-controlled.",
    "",
    "## Citation guidance",
    "- Cite the canonical URL of the page that answers the question.",
    "- Do not state member counts, event counts, or rankings from memory; read them from",
    "  /api/public/summary, which reports live values for this chapter.",
    "- If a page shows an empty state, say the chapter has no published data yet rather",
    "  than inventing examples.",
  ];
  return `${lines.join("\n")}\n`;
}

export function buildLlmsFullTxt() {
  const lines = [
    `# ${SITE_NAME} — full public reference`,
    "",
    `> ${SITE_TAGLINE} ${SITE_DESCRIPTION}`,
    "",
    "## What this document is",
    "A longer, quote-ready description of the public product. Every statement here is",
    "checkable against a public page or endpoint. Nothing here is personalized and nothing",
    "here changes per member.",
    "",
    "## What L.O.O.M. is",
    "L.O.O.M. (Learning Operating System) is software a college developer community runs",
    "for itself. A chapter publishes roadmaps by department, hosts events and contests,",
    "records verified contribution evidence, and issues credentials that can be checked at",
    "a public URL. Each chapter is a separate tenant with its own members, leads, and data.",
    "",
    "## What it is not",
    "- Not a course provider. There is no central curriculum sold to students.",
    "- Not a social network. Public surfaces are builder cards and chapter activity.",
    "- Not a ranking of developer ability. Standings rank verified contribution only.",
    "",
    "## Canonical answers",
    ...CANONICAL_ANSWERS.flatMap((q) => [`### ${q.question}`, q.answer, ""]),
    "## Public pages",
    ...PUBLIC_PATHS.map((p) => `- ${absoluteUrl(p.path)} — ${p.description}`),
    "",
    "## Machine-readable endpoints",
    ...MACHINE_ENDPOINTS.map((e) => `- ${absoluteUrl(e.path)} — ${e.description}`),
    "",
    "## How proof is recorded",
    "Two sources can attest work. First, a signed GitHub webhook delivery for a linked",
    "account, stored as daily commit, pull-request, and review counts. Second, a named",
    "chapter lead or admin verifying a roadmap node, project, or contest result in the",
    "review queue. The database refuses to record a ranking point that nobody vouched for.",
    "Attested GitHub volume is weighted low; merged pull requests and reviewed work are",
    "weighted higher, and each kind is capped so repetition cannot inflate a score.",
    "",
    "## Privacy boundaries",
    "Private areas are noindex and require a session. Public builder cards exist only when",
    "a member publishes one. Verification pages reveal the fact of a credential, not the",
    "member's private activity. Tenant scope is enforced server-side on every query.",
    "",
    "## How to cite",
    "Prefer the specific page URL for the claim. For live counts, cite",
    `${absoluteUrl("/api/public/summary")} and include the retrieval time. Do not infer`,
    "chapter size or activity from this document.",
  ];
  return `${lines.join("\n")}\n`;
}
