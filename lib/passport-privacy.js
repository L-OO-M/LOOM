// Public Developer Passport Privacy & Field-Level Visibility Engine (pure, no DB).
//
// Governs what profile attributes and evidence are exposed on /u/[username].
// Visibility levels:
//   - 'private': Account owner only.
//   - 'chapter': Signed-in members of the same chapter, or owner.
//   - 'public':  Anyone on the internet.
//   - 'hidden':   Not visible to anyone, including public passport view.

export const VISIBILITY_LEVELS = ["private", "chapter", "public", "hidden"];

export const DEFAULT_PASSPORT_PRIVACY = Object.freeze({
  visibility: "chapter",
  show_roll_number: "private",
  show_branch: "chapter",
  show_year: "chapter",
  show_department_work: "private",
  show_github_stats: "private",
  show_certificates: "public"
});

/**
 * Decide if a field is visible to a viewer.
 *
 * @param {object} params
 * @param {string} params.fieldLevel Privacy level configured for this field ('private' | 'chapter' | 'public' | 'hidden')
 * @param {boolean} params.isOwner True if viewer is the profile owner
 * @param {boolean} params.isSameChapter True if viewer is authenticated in the same chapter/tenant
 */
export function isFieldVisible({ fieldLevel = "private", isOwner = false, isSameChapter = false }) {
  if (fieldLevel === "hidden") return false;
  if (isOwner) return true;
  if (fieldLevel === "public") return true;
  if (fieldLevel === "chapter") return isSameChapter;
  return false; // 'private' or unknown
}

export function passportPrivacy(config = {}) {
  return { ...DEFAULT_PASSPORT_PRIVACY, ...(config || {}) };
}

export function isPassportPublic(config = {}) {
  return passportPrivacy(config).visibility === "public";
}

/**
 * Apply field visibility to the shared proof read model. The public profile
 * must not hide a project/certificate/activity section and then re-introduce
 * the same fact through proof counts or proof cards.
 */
export function filterProofForPassport(
  proof,
  privacyConfig = {},
  { isOwner = false, isSameChapter = false } = {}
) {
  const cfg = passportPrivacy(privacyConfig);
  const showProjects = isFieldVisible({
    fieldLevel: cfg.show_department_work,
    isOwner,
    isSameChapter
  });
  const showGithub = isFieldVisible({
    fieldLevel: cfg.show_github_stats,
    isOwner,
    isSameChapter
  });
  const showCertificates = isFieldVisible({
    fieldLevel: cfg.show_certificates,
    isOwner,
    isSameChapter
  });
  const items = (Array.isArray(proof?.items) ? proof.items : []).filter((item) => {
    if (item?.kind === "project") return showProjects;
    if (item?.kind === "activity") return showGithub;
    if (item?.kind === "certificate") return showCertificates;
    return true;
  });
  const countItems = (kind) => items.filter((item) => item?.kind === kind).length;
  const sumItemCount = (kind) => items.reduce((total, item) =>
    total + (item?.kind === kind ? Number(item.count) || 0 : 0), 0
  );
  return {
    items,
    counts: {
      verifiedProjects: items.filter((item) => item.kind === "project" && item.verified).length,
      mergedPrs: items.filter((item) => item.kind === "oss" && item.verified).length,
      solvedProblems: sumItemCount("leetcode"),
      certificates: countItems("certificate"),
      activeDays: sumItemCount("activity")
    }
  };
}

/**
 * Filter profile fields server-side before presenting or rendering.
 * Guarantees restricted academic data or internal work is never sent to the client.
 */
export function filterProfileForPassport(profile, privacyConfig = {}, { isOwner = false, isSameChapter = false } = {}) {
  if (!profile) return null;
  const cfg = passportPrivacy(privacyConfig);

  // If entire profile visibility is private/hidden and viewer is not owner/chapter:
  if (cfg.visibility === "hidden" && !isOwner) return null;
  if (cfg.visibility === "private" && !isOwner) return null;
  if (cfg.visibility === "chapter" && !isSameChapter && !isOwner) return null;

  return {
    ...profile,
    roll_number: isFieldVisible({ fieldLevel: cfg.show_roll_number, isOwner, isSameChapter }) ? profile.roll_number : null,
    branch: isFieldVisible({ fieldLevel: cfg.show_branch, isOwner, isSameChapter }) ? profile.branch : null,
    year: isFieldVisible({ fieldLevel: cfg.show_year, isOwner, isSameChapter }) ? profile.year : null,
    department_work: isFieldVisible({ fieldLevel: cfg.show_department_work, isOwner, isSameChapter }) ? profile.department_work : [],
    github_stats: isFieldVisible({ fieldLevel: cfg.show_github_stats, isOwner, isSameChapter }) ? profile.github_stats : null,
    certificates: isFieldVisible({ fieldLevel: cfg.show_certificates, isOwner, isSameChapter }) ? profile.certificates : []
  };
}
