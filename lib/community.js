// Community helpers: slugify (pure), vote toggling with a strict table whitelist,
// the supported flag reasons (spam, abuse, off-topic), and tag parsing shared
// by the thread/snippet forms (pure, unit-tested).
export const FLAG_REASONS = ["spam", "abuse", "off-topic"];

export function isFlagReason(reason) {
  return FLAG_REASONS.includes(reason);
}

// "dp, Recursion!" -> ["dp", "recursion"]; max 5, lowercase slug-ish tokens.
export function parseTags(raw) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 30))
    .filter(Boolean)
    .slice(0, 5);
}

export function slugify(text) {
  return (text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-|-$/g, "") || "untitled";
}

const VOTE_TABLES = {
  thread: "forum_threads",
  reply: "forum_replies",
  snippet: "code_snippets"
};

export function voteTableFor(targetType) {
  return VOTE_TABLES[targetType] || null;
}

// Toggles a student's vote; keeps the denormalized upvote_count in sync.
// Returns { voted: true } when added, { voted: false } when removed.
export async function toggleVote({ sql, studentId, targetType, targetId }) {
  const table = voteTableFor(targetType);
  if (!table) throw new Error("INVALID_TARGET");
  const existing = await sql`
    SELECT id FROM forum_votes WHERE student_id = ${studentId} AND target_type = ${targetType} AND target_id = ${targetId} LIMIT 1
  `;
  if (existing.length) {
    await sql`DELETE FROM forum_votes WHERE id = ${existing[0].id}`;
    if (table === "forum_threads") await sql`UPDATE forum_threads SET upvote_count = GREATEST(0, upvote_count - 1) WHERE id = ${targetId}`;
    if (table === "forum_replies") await sql`UPDATE forum_replies SET upvote_count = GREATEST(0, upvote_count - 1) WHERE id = ${targetId}`;
    if (table === "code_snippets") await sql`UPDATE code_snippets SET upvote_count = GREATEST(0, upvote_count - 1) WHERE id = ${targetId}`;
    return { voted: false };
  }
  await sql`
    INSERT INTO forum_votes (student_id, target_type, target_id)
    VALUES (${studentId}, ${targetType}, ${targetId})
    ON CONFLICT (student_id, target_type, target_id) DO NOTHING
  `;
  if (table === "forum_threads") await sql`UPDATE forum_threads SET upvote_count = upvote_count + 1 WHERE id = ${targetId}`;
  if (table === "forum_replies") await sql`UPDATE forum_replies SET upvote_count = upvote_count + 1 WHERE id = ${targetId}`;
  if (table === "code_snippets") await sql`UPDATE code_snippets SET upvote_count = upvote_count + 1 WHERE id = ${targetId}`;
  return { voted: true };
}
