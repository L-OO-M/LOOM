/**
 * The organisation, as data.
 *
 * `departments` rows live in Postgres and admins can create/archive more. This
 * catalogue is the *shipped* thirteen: the ones the product knows how to give a
 * workspace, a learning track and a cover image. Anything an admin creates still
 * works as a department; it simply falls back to the vertical's default art and
 * the generic workspace.
 *
 * Keep slugs in step with load/seed-departments.js and the permission matrix in
 * lib/permissions.js. A slug that exists in only one of the three files is the
 * bug class this file exists to prevent.
 */

export const VERTICAL_LABEL = {
  technical: "Technical",
  non_technical: "Non-technical"
};

/**
 * `modules` describes the layout of the department workspace, not authority.
 * Authority is always `can()` in lib/permissions.js; the workspace renders a
 * module only when the member actually holds the matching permission.
 */
export const DEPARTMENT_CATALOG = [
  {
    slug: "ai_ml",
    name: "AI / ML",
    shortName: "AI / ML",
    vertical: "technical",
    glyph: "AI",
    accent: "#8B5CF6",
    tagline: "Models, data, and the maths that make them work.",
    description:
      "Machine learning fundamentals, paper reading, dataset contests, and applied projects that ship a working model rather than a notebook.",
    owns: [
      "Learning track for Python, classical ML, deep learning, NLP and vision",
      "Dataset curation and reproducible training runs",
      "Applied AI mini-projects with a demo and a write-up",
      "Paper-reading sessions and model-building workshops"
    ],
    modules: ["events", "tasks", "reports", "contributions"],
    aliases: ["ai", "ml", "machine learning", "artificial intelligence", "artificial intelligence ml", "artificial intelligence and ml"]
  },
  {
    slug: "web",
    name: "Web Development",
    shortName: "Web",
    vertical: "technical",
    glyph: "WD",
    accent: "#38BDF8",
    tagline: "Interfaces, browsers, and the product layer.",
    description:
      "Modern web fundamentals, frameworks, Git workflow and deployment — including this very site. Backend and DevOps are shared skills inside this track, not separate departments.",
    owns: [
      "Frontend, full-stack and API learning track",
      "Repositories, reviews and release practice",
      "Deployment requests through the shared infrastructure function",
      "Workshops that ship a real page or service each session"
    ],
    modules: ["events", "tasks", "reports", "contributions"],
    aliases: ["web development", "frontend", "full stack", "backend", "devops", "infra"]
  },
  {
    slug: "cybersecurity",
    name: "Cybersecurity",
    shortName: "Security",
    vertical: "technical",
    glyph: "CS",
    accent: "#F43F5E",
    tagline: "Offence and defence: recon, exploitation, hardening.",
    description:
      "Ethical hacking inside legal boundaries, CTFs, cryptography and secure coding. Authorised testing only — production access is never implied by leading this department.",
    owns: [
      "Security labs and CTF practice",
      "Threat modelling and secure-code reviews",
      "Write-ups for disclosed, permitted findings",
      "Hardening guides for the society's own services"
    ],
    modules: ["events", "tasks", "reports", "contributions"],
    aliases: ["cyber security", "security", "appsec", "infosec"]
  },
  {
    slug: "dsa",
    name: "DSA & Problem Solving",
    shortName: "DSA",
    vertical: "technical",
    glyph: "DS",
    accent: "#FACC15",
    tagline: "Structures, algorithms, and problem solving under pressure.",
    description:
      "Weekly problem-solving, contests, interview preparation and mock assessments — measured by problems solved and explained, not videos watched.",
    owns: [
      "Weekly problem sets and editorial notes",
      "Coding contests and timed mock rounds",
      "Interview-style peer practice",
      "Practice leaderboards backed by verified solves"
    ],
    modules: ["events", "tasks", "reports", "contributions"],
    aliases: ["data structures", "algorithms", "problem solving", "dsa and problem solving"]
  },
  {
    slug: "blockchain",
    name: "Blockchain",
    shortName: "Blockchain",
    vertical: "technical",
    glyph: "BC",
    accent: "#A78BFA",
    tagline: "Contracts, chains, and decentralised systems.",
    description:
      "Distributed ledgers, smart contracts and Web3 mini-projects, with an emphasis on what the chain actually guarantees.",
    owns: [
      "Smart-contract labs on a test network only",
      "Protocol and consensus reading sessions",
      "Web3 mini-projects with public repositories",
      "Security notes on common contract failure modes"
    ],
    modules: ["events", "tasks", "reports", "contributions"],
    aliases: ["web3", "smart contracts"]
  },
  {
    slug: "embedded",
    name: "Embedded & Hardware",
    shortName: "Hardware",
    vertical: "technical",
    glyph: "EH",
    accent: "#2DD4BF",
    tagline: "Firmware, microcontrollers, and hardware bring-up.",
    description:
      "Microcontrollers, Arduino, Raspberry Pi, sensors and firmware — build things you can hold, and document the bring-up so the next person can repeat it.",
    owns: [
      "Firmware and electronics learning track",
      "Equipment requests and component inventory",
      "Hardware bring-up logs and schematics",
      "Demo days for physical builds"
    ],
    modules: ["events", "tasks", "reports", "contributions"],
    aliases: ["embedded systems", "hardware", "embedded and hardware", "embedded systems hardware", "iot"]
  },

  {
    slug: "design",
    name: "Design",
    shortName: "Design",
    vertical: "non_technical",
    glyph: "DE",
    accent: "#FB7185",
    tagline: "Give ideas a visual identity.",
    description:
      "Posters, banners, merch, slide systems, brand templates and media assets. Design produces the artwork; publishing strategy belongs to Publicity.",
    owns: [
      "Visual identity and brand templates",
      "Posters, banners and event creatives",
      "Asset library with versions and source files",
      "Design deadlines handed over from event teams"
    ],
    modules: ["assets", "events", "tasks", "reports"],
    aliases: ["creative", "graphics", "design and creative", "brand"]
  },
  {
    slug: "documentation",
    name: "Documentation",
    shortName: "Docs",
    vertical: "non_technical",
    glyph: "DC",
    accent: "#94A3B8",
    tagline: "Record what happened, so the next team starts ahead.",
    description:
      "Event records, reports, minutes, budget notes and post-event analysis. Documentation may record expenditure when authorised; it never approves or alters a transaction.",
    owns: [
      "Event reports, minutes and archives",
      "Monthly department reports and revisions",
      "Official document templates",
      "Post-event analysis and lessons learned"
    ],
    modules: ["reports", "events", "assets"],
    aliases: ["docs", "documentation and records", "records"]
  },
  {
    slug: "smm_content",
    name: "SMM & Content Creation",
    shortName: "SMM",
    vertical: "non_technical",
    glyph: "SM",
    accent: "#F472B6",
    tagline: "Produce the content; earn the right to publish it.",
    description:
      "Social media calendars, photography, video editing, reels and content archives. Official society-wide announcements still require approval.",
    owns: [
      "Content calendar and publishing schedule",
      "Photography and video from events",
      "Reels, captions and platform-native edits",
      "Content archive with usage rights noted"
    ],
    modules: ["assets", "events", "tasks", "announcements"],
    aliases: ["smm", "social media", "content", "content creation", "smm and content creation"]
  },
  {
    slug: "publicity",
    name: "Publicity",
    shortName: "Publicity",
    vertical: "non_technical",
    glyph: "PB",
    accent: "#FB923C",
    tagline: "Make the work visible — on purpose, not by accident.",
    description:
      "Promotional campaigns, event awareness, campus presence and campaign effectiveness. Publicity decides where a message goes; it does not own the social accounts.",
    owns: [
      "Campaign plans tied to a real event or intake",
      "Channel mix and distribution schedule",
      "Reach and response tracking",
      "Cross-department promotion coordination"
    ],
    modules: ["announcements", "events", "tasks", "reports"],
    aliases: ["promotions", "marketing", "outreach"]
  },
  {
    slug: "sponsorship",
    name: "Sponsorship",
    shortName: "Sponsorship",
    vertical: "non_technical",
    glyph: "SP",
    accent: "#EAB308",
    tagline: "Fund the work without promising what we cannot deliver.",
    description:
      "Sponsor pipeline, proposals, commitments and deliverables. Sponsorship negotiates and tracks; budgets are approved by an authorised administrator, never by the department that spends them.",
    owns: [
      "Sponsor pipeline and follow-ups",
      "Proposals, decks and entitlement sheets",
      "Commitments, deliverables and proof of delivery",
      "Sponsorship records linked to MoUs"
    ],
    modules: ["leads", "budget", "events", "reports"],
    aliases: ["sponsors", "sponsorship and evm", "sponsorship evm", "funding"]
  },
  {
    slug: "management",
    name: "Management",
    shortName: "Ops",
    vertical: "non_technical",
    glyph: "MG",
    accent: "#60A5FA",
    tagline: "Turn a plan into a run sheet people can follow.",
    description:
      "Event execution, logistics, task assignment and interdepartmental coordination. Management owns event operations; other departments receive the tasks assigned to them.",
    owns: [
      "Event plans, run sheets and timelines",
      "Task assignment across departments",
      "Venue, logistics and on-the-day operations",
      "Operational progress and blocker tracking"
    ],
    modules: ["events", "tasks", "budget", "reports"],
    aliases: ["event management", "event ops", "operations", "evm"]
  },
  {
    slug: "public_relations",
    name: "Public Relations",
    shortName: "PR",
    vertical: "non_technical",
    glyph: "PR",
    accent: "#4ADE80",
    tagline: "Build relationships that outlast a single event.",
    description:
      "External institutional contacts, collaborations and partnerships. PR keeps relationship records separate from the sponsorship pipeline and never sees member data it does not need.",
    owns: [
      "External contacts and institutional outreach",
      "Collaboration and partnership records",
      "Follow-ups and relationship history",
      "MoU coordination with Sponsorship"
    ],
    modules: ["leads", "events", "reports"],
    aliases: ["pr", "relations", "external relations", "public relations"]
  }
];

export const DEPARTMENT_SLUGS = DEPARTMENT_CATALOG.map((d) => d.slug);

/** Old slugs still present in links, bookmarks and old rows. */
export const LEGACY_DEPARTMENT_REDIRECT = {
  backend: "web",
  devops: "web",
  pr_outreach: "public_relations",
  sponsorship_evm: "sponsorship"
};

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[\s_\-&/]+/g, " ")
    .trim();
}

export function departmentMeta(value) {
  if (!value) return null;
  const key = normalize(value);
  if (!key) return null;
  const bySlug = DEPARTMENT_CATALOG.find((d) => normalize(d.slug) === key);
  if (bySlug) return bySlug;
  // Retired slugs resolve *before* aliases: `pr_outreach` is both a former
  // department and, historically, a phrase used for publicity. The department
  // that inherited the slug decides, not the nearest alias.
  const successor = legacyDepartmentRedirect(value);
  if (successor) return DEPARTMENT_CATALOG.find((d) => d.slug === successor) || null;
  return (
    DEPARTMENT_CATALOG.find(
      (d) => normalize(d.name) === key || normalize(d.shortName) === key || d.aliases.some((a) => normalize(a) === key)
    ) || null
  );
}

export function departmentArt(value) {
  const meta = departmentMeta(value);
  if (meta) return `/departments/${meta.slug}.png`;
  // Preserve resolution for rows that still carry a retired slug.
  const legacy = LEGACY_DEPARTMENT_REDIRECT[normalize(value).replace(/\s+/g, "_")];
  return legacy ? `/departments/${legacy}.png` : null;
}

export function departmentsByVertical(vertical) {
  return DEPARTMENT_CATALOG.filter((d) => d.vertical === vertical);
}

export function catalogCounts() {
  const technical = departmentsByVertical("technical").length;
  const nonTechnical = departmentsByVertical("non_technical").length;
  return { technical, nonTechnical, total: technical + nonTechnical };
}

/** Slug an old link should land on, or null when it is already current. */
export function legacyDepartmentRedirect(value) {
  return LEGACY_DEPARTMENT_REDIRECT[normalize(value).replace(/\s+/g, "_")] || null;
}

/** True when the slug belongs to the shipped catalogue. */
export function isCatalogDepartment(value) {
  return !!departmentMeta(value);
}
