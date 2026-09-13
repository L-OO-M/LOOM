export const CLASSIFICATION_VERSION = 1;

export function classifyStudent({ progressByDomain = {}, githubByDomain = {}, contestScore = 0, mentorshipSessions = 0 }) {
  const domains = new Set([...Object.keys(progressByDomain), ...Object.keys(githubByDomain)]);
  const scored = [...domains].map((domain) => {
    const progress = progressByDomain[domain] ?? 0;
    const github = githubByDomain[domain] ?? 0;
    const score = progress * 0.55 + github * 0.35 + contestScore * 0.07 + mentorshipSessions * 0.03;
    return { domain, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const top = scored[0] ?? { domain: "foundation", score: 0 };
  const total = scored.reduce((sum, item) => sum + item.score, 0);
  const confidence = total > 0 ? Number(Math.min(0.95, top.score / total).toFixed(2)) : 0.35;

  return {
    primaryDomain: top.domain,
    confidence,
    activityLevel: top.score > 75 ? "high_momentum" : top.score > 45 ? "consistent" : "building",
    learningStage: top.score > 70 ? "intermediate" : top.score > 35 ? "foundation_plus" : "foundation",
    cohort: top.score > 65 ? "domain_specialist" : "guided_builder",
    version: CLASSIFICATION_VERSION,
    timestamp: new Date().toISOString(),
    inputs: { progressByDomain, githubByDomain, contestScore, mentorshipSessions },
    result: scored
  };
}
