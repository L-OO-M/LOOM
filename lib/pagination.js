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

/** Rows per page for admin lists when the URL does not ask for another size. */
export const PAGE_SIZE_DEFAULT = 50;

/** Hard ceiling for a client-supplied `pageSize`, enforced server-side. */
export const PAGE_SIZE_MAX = 100;

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

/**
 * `pageSize` from a query string, clamped to [1, maxPageSize].
 *
 * Missing, empty, zero, negative, fractional, or non-numeric input falls back to
 * `fallback` (itself normalised), so a junk `?pageSize=abc` renders 50 rows
 * instead of throwing or asking Postgres for LIMIT NaN.
 */
export function pageSizeParam(value, fallback = PAGE_SIZE_DEFAULT, maxPageSize = PAGE_SIZE_MAX) {
  const cap = Math.max(1, Math.trunc(Number(maxPageSize)) || PAGE_SIZE_MAX);
  const base = Math.min(pageSizeOf(fallback), cap);
  const size = Math.trunc(Number(value));
  if (!Number.isFinite(size) || size < 1) return base;
  return Math.min(size, cap);
}

/**
 * Read `page`/`pageSize` from either a URLSearchParams or a Next searchParams
 * object. The page number stays raw here: it is clamped by `pageWindow` only
 * once the matching row count is known.
 */
export function requestPage(source, {
  defaultPageSize = PAGE_SIZE_DEFAULT,
  maxPageSize = PAGE_SIZE_MAX,
  pageKey = "page",
  pageSizeKey = "pageSize"
} = {}) {
  return {
    page: readParam(source, pageKey),
    pageSize: pageSizeParam(readParam(source, pageSizeKey), defaultPageSize, maxPageSize)
  };
}

/** URLSearchParams and plain objects are both acceptable param sources. */
function readParam(source, key) {
  if (!source) return undefined;
  if (typeof source.get === "function") return source.get(key);
  return source[key];
}

/**
 * Pager metadata for API envelopes. `totalPages` mirrors `win.pages` so a
 * client can name the field it expects; every key the roster pager reads is
 * present so the two surfaces cannot drift apart.
 */
export function paginationMeta(win) {
  return {
    page: win.page,
    pageSize: win.pageSize,
    total: win.total,
    totalPages: win.pages,
    from: win.from,
    to: win.to,
    hasPrev: win.hasPrev,
    hasNext: win.hasNext,
    outOfRange: win.outOfRange,
    requestedPage: win.requestedPage
  };
}

/**
 * Build a pager href that carries every active filter forward.
 *
 * Empty/undefined values are dropped (no `?q=` noise) and page 1 stays implicit
 * so URLs never drift into a redundant `?page=1`. `pageParam` lets a second list
 * on the same page (mentor sessions) page independently of the first.
 */
export function pageHref(basePath, params = {}, page = 1, pageParam = "page") {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === pageParam) continue;
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const n = pageOf(page);
  if (Number.isFinite(n) && n > 1) search.set(pageParam, String(Math.trunc(n)));
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
