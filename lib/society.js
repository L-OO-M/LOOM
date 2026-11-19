// The society's own open-source challenge.
//
// LOOM maintains a deliberately broken repository (`L-OO-M/buggy`) where every
// domain has a small project with a real bug. Members fork it, fix one thing,
// and submit the fork. This module is the single place that knows where each
// domain's folder lives, so the roadmap panel, the challenge hub, and the API
// cannot disagree about the URL a member is sent to.
//
// No network here: it is configuration, so it is testable without GitHub.

import { debugChallengeRepo } from "@/lib/debug";

/** LOOM domain -> folder inside the society challenge repository. */
export const SOCIETY_FOLDERS = {
  ai_ml: "domains/ai-ml",
  web: "domains/web-dev",
  cybersecurity: "domains/cybersecurity",
  dsa: "domains/dsa",
  blockchain: "domains/blockchain",
  embedded: "domains/embedded-hardware"
};

/** Folders that are real today. Shared tracks (backend, devops) have none yet. */
export function societyFolder(domain) {
  return SOCIETY_FOLDERS[domain] || null;
}

/**
 * The challenge view for one track. `hasFolder` is honest: a shared track points
 * at the repository root and says so rather than linking to a 404.
 */
export function societyChallenge(domain, repo = debugChallengeRepo()) {
  const folder = societyFolder(domain);
  return {
    repo,
    url: `https://github.com/${repo}`,
    folder,
    folderUrl: folder ? `https://github.com/${repo}/tree/main/${folder}` : `https://github.com/${repo}`,
    hasFolder: Boolean(folder)
  };
}

/** The society repository itself, for pages that only need the name/link. */
export function societyRepo() {
  return debugChallengeRepo();
}

// The rules are shown on the site rather than hidden in a README, because the
// submission the member makes is judged against exactly this list.
export const SOCIETY_RULES = [
  {
    title: "Fork, never ask for write access",
    body: "Fork the society repository to your own GitHub account. You work in the fork; nothing is pushed to the society copy."
  },
  {
    title: "Stay inside your domain folder",
    body: "A web fix touches domains/web-dev. A DSA fix touches domains/dsa. Cross-domain edits are returned, not merged."
  },
  {
    title: "One coherent fix per fork",
    body: "Fix the bug the project README describes. Small, reviewable diffs are approved faster than a rewrite."
  },
  {
    title: "Commit as yourself",
    body: "At least one commit must come from the GitHub account linked to LOOM. The automated check compares the fork owner to that account."
  },
  {
    title: "Submit the fork link here",
    body: "Paste the fork URL on this page. LOOM checks it is a public fork of the society repository, created by you, with your commit."
  },
  {
    title: "A domain lead grades it",
    body: "Approval records the work as verified evidence and adds it to chapter standing. A rejection comes back with feedback and costs nothing."
  },
  {
    title: "No secrets, no borrowed work",
    body: "Never commit credentials. A fork that belongs to someone else is rejected and the submission is closed."
  }
];
