const DOMAIN_ART = {
  ai: "/domains-art/domain-ai.png",
  ai_ml: "/domains-art/domain-ai.png",
  machine_learning: "/domains-art/domain-ai.png",
  embedded: "/domains-art/domain-ai.png",
  web: "/domains-art/domain-web.png",
  web_development: "/domains-art/domain-web.png",
  frontend: "/domains-art/domain-web.png",
  dsa: "/domains-art/domain-web.png",
  backend: "/domains-art/domain-infra.png",
  infra: "/domains-art/domain-infra.png",
  infrastructure: "/domains-art/domain-infra.png",
  devops: "/domains-art/domain-infra.png",
  blockchain: "/domains-art/domain-infra.png",
  cybersecurity: "/domains-art/domain-infra.png",
  design: "/domains-art/domain-creative.png",
  creative: "/domains-art/domain-creative.png",
  pr: "/domains-art/domain-creative.png",
  outreach: "/domains-art/domain-creative.png",
  content: "/domains-art/domain-creative.png",
  marketing: "/domains-art/domain-creative.png"
};

// Department covers live in lib/department-catalog.js with the rest of the
// department identity (one slug list, one set of aliases). This module keeps the
// artwork entry points the rest of the app imports.
import { departmentArt as catalogDepartmentArt } from "./department-catalog.js";

const EVENT_ART = {
  talk: "/events/event-talk.png",
  workshop: "/events/event-workshop.png",
  hackathon: "/events/event-hackathon.png",
  contest: "/events/event-contest.png",
  ctf: "/events/event-contest.png",
  mentoring: "/events/event-workshop.png",
  meetup: "/events/event-talk.png",
  general: "/events/event-contest.png"
};

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function domainArt(domain) {
  const key = normalize(domain);
  if (!key) return null;
  return DOMAIN_ART[key] || DOMAIN_ART[key.replace(/_/g, "")] || null;
}

export function eventArt(type) {
  const key = normalize(type);
  if (!key) return EVENT_ART.general;
  return EVENT_ART[key] || EVENT_ART.general;
}

/**
 * Cover art for a department. Accepts a slug, a shipped name, or a retired name
 * (`backend`, `pr_outreach`, `sponsorship_evm`) so old rows and links still draw
 * the right picture. Unknown departments return null and the caller falls back to
 * a plain surface rather than borrowing another department's identity.
 */
export const departmentArt = catalogDepartmentArt;
