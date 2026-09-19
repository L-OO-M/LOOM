// Chapter display helpers (pure, no React). Shared by the student
// Chapters list (/student/network) and chapter detail (/student/network/[slug]).

/**
 * Initials for a chapter avatar circle: first letters of the first two
 * significant words. Falls back to "?" for empty input. Never throws.
 */
export function initialsFor(name) {
  if (!name || typeof name !== "string") return "?";
  const words = name
    .replace(/^(the|a|an)\s+/i, "")
    .split(/[\s\-_/|]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
