// Idempotency rules for the announcement → notification fan-out.
//
// The key lands in notifications.dedupe_key, covered by the partial unique index
// notifications_user_dedupe_key_idx ON (user_id, dedupe_key) WHERE dedupe_key IS
// NOT NULL. A retried fan-out therefore adds nothing instead of duplicating a
// recipient's inbox. Keep the format in sync with the SQL in
// app/api/announcements/route.js.

const SCOPES = Object.freeze(["society", "vertical", "department"]);

/**
 * `announcement:<id>:` — the shared prefix for every recipient of one post.
 * The route binds this and concatenates the recipient id in SQL so the fan-out
 * stays one statement; the format lives here, not in two places.
 */
export function announcementKeyPrefix(announcementId) {
  const id = String(announcementId ?? "").trim();
  if (!id) throw new Error("announcementKeyPrefix needs an announcement id");
  return `announcement:${id}:`;
}

/** `announcement:<id>:<user>` — stable across retries, distinct per recipient. */
export function announcementDedupeKey(announcementId, userId) {
  const user = String(userId ?? "").trim();
  if (!user) throw new Error("announcementDedupeKey needs a user id");
  return announcementKeyPrefix(announcementId) + user;
}

/** The scopes the fan-out knows how to deliver; anything else must not silently reach nobody. */
export function recipientScopeOf(scope) {
  if (!SCOPES.includes(scope)) throw new Error(`Unsupported announcement scope: ${scope}`);
  return scope;
}
