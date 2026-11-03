// One UUID predicate for route params and request bodies.
//
// Postgres uuid columns reject a non-uuid string with a 22P02 error, which the
// API surfaces as a 500. Checking the shape first turns "garbage in the URL"
// into an ordinary 404/400 instead of a server error.
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}
