// Page arithmetic for server-rendered lists.
//
// `page` arrives straight from a query string, so it can be "2", "-3", "0",
// "abc", "2.7", "1e9", or an empty string. Every list route needs the same
// three answers — which page am I actually on, which rows does it cover, and is
// there a page before or after it — so the arithmetic lives here instead of
// being re-derived with a scatter of Math.min/Math.ceil at each call site, and
// stays unit-testable without a database or a DOM.
//
// Clamping never invents rows: an explicit page past the end is reported with
// `outOfRange` so the route can render an honest empty state (and a link to the
// last real page) rather than silently re-showing page 1.

/** Positive integer row count per page; anything unusable falls back to 1. */
function pageSizeOf(pageSize) {
  const size = Math.trunc(Number(pageSize));
  return Number.isFinite(size) && size > 0 ? size : 1;
}

/** Total rows, normalised to a non-negative integer. */
function totalOf(total) {
  const count = Math.trunc(Number(total));
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/** Page number as a finite integer, or NaN for "abc"/undefined/null. */
function pageOf(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : NaN;
}

/** Number of pages needed for `total` rows; 0 when there is nothing to show. */
export function pageCount(total, pageSize) {
  const count = totalOf(total);
  if (count === 0) return 0;
  return Math.ceil(count / pageSizeOf(pageSize));
}

/** Requested page clamped to [1, last page]; garbage and 0/negative become 1. */
export function clampPage(value, total, pageSize) {
  const pages = pageCount(total, pageSize);
  const n = pageOf(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return pages === 0 ? 1 : Math.min(n, pages);
}

/**
 * Everything a pager needs, in one call.
 *
 * `from`/`to` are the 1-based inclusive row numbers covered by the page (both
 * 0 when there are no rows at all); `offset` is the SQL OFFSET.
 */
export function pageWindow(total, page, pageSize) {
  const size = pageSizeOf(pageSize);
  const count = totalOf(total);
  const pages = pageCount(count, size);
  const requested = pageOf(page);
  const current = clampPage(requested, count, size);

  // Only a page number the caller actually asked for can be out of range; a
  // missing/garbage value already means "page 1", and an empty result set is
  // the ordinary "no matches" case rather than a bad URL.
  const outOfRange = pages > 0 && Number.isFinite(requested) && requested > pages;

  const from = count === 0 ? 0 : (current - 1) * size + 1;
  const to = count === 0 ? 0 : Math.min(current * size, count);

  return {
    page: current,
    pages,
    pageSize: size,
    total: count,
    offset: (current - 1) * size,
    from,
    to,
    hasPrev: current > 1,
    hasNext: current < pages,
    outOfRange,
    // What the URL asked for, for the "page 9 does not exist" message.
    requestedPage: Number.isFinite(requested) && requested > 0 ? requested : current
  };
}
