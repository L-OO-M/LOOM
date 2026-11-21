// GitHub's own contribution calendar, for the days webhooks never saw.
//
// The heatmap on /student/github and on a public profile is fed by
// `student_daily_activity`, which the webhook writes. That is honest, but it is
// only as complete as the webhook installation: a repository whose hook was
// added late, a chapter that enabled ingestion after the member started
// contributing, or work in a repository outside the watched set all leave real
// days blank. GitHub already computes the same days for every profile, and the
// OAuth token carries `read:user`, so one GraphQL query can fill them in.
//
// The result is stored in its own column and merged with max(), never added to
// the webhook counters. A push is one commit and one contribution; summing the
// two views would double every day the webhook did record.

const GRAPHQL_URL = "https://api.github.com/graphql";

// Long enough to cover every surface that renders the grid (the widest window
// is 120 days) without storing a year of zero rows per member.
export const CONTRIBUTION_DAYS = 180;

export const CONTRIBUTION_CALENDAR_QUERY = `query LoomCalendar($from: DateTime!, $to: DateTime!) {
  viewer {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}`;

/**
 * Flatten the nested calendar into `[{ day, count }]`, dropping zero days.
 *
 * Only days with something to record are returned: writing a row per empty day
 * would fill the ledger with zeroes and make "active days" a counting exercise.
 * Malformed entries are skipped rather than throwing -- a single bad day must
 * not cost the member the whole grid.
 */
export function normalizeContributionCalendar(payload) {
  const weeks =
    payload?.data?.viewer?.contributionsCollection?.contributionCalendar?.weeks;
  if (!Array.isArray(weeks)) return [];
  const seen = new Set();
  const days = [];
  for (const week of weeks) {
    const entries = Array.isArray(week?.contributionDays) ? week.contributionDays : [];
    for (const entry of entries) {
      const day = typeof entry?.date === "string" ? entry.date.slice(0, 10) : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || seen.has(day)) continue;
      const count = Number(entry?.contributionCount);
      if (!Number.isFinite(count) || count < 0) continue;
      seen.add(day);
      const whole = Math.floor(count);
      if (whole > 0) days.push({ day, count: whole });
    }
  }
  days.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return days;
}

function windowFor(days, now) {
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - (Math.max(1, days) - 1));
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * Read `viewer`'s calendar. Never throws: a network or schema failure returns a
 * reason the caller can log or ignore, because a calendar read must not take
 * down an OAuth callback or a repository refresh.
 */
export async function fetchContributionCalendar({
  accessToken,
  days = CONTRIBUTION_DAYS,
  now = Date.now(),
  timeoutMs = 12_000,
  fetchImpl = fetch
}) {
  if (!accessToken) return { ok: false, reason: "NO_TOKEN", days: [] };
  const { from, to } = windowFor(days, now);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "LOOM"
      },
      body: JSON.stringify({
        query: CONTRIBUTION_CALENDAR_QUERY,
        variables: { from, to }
      }),
      signal: controller.signal,
      cache: "no-store"
    });
  } catch {
    return { ok: false, reason: "UNAVAILABLE", days: [] };
  } finally {
    clearTimeout(timer);
  }

  if (!response?.ok) {
    return { ok: false, reason: `HTTP_${Number(response?.status) || 0}`, days: [] };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, reason: "BAD_RESPONSE", days: [] };
  }
  if (payload?.errors?.length) {
    // A token without `read:user` is the common cause; the caller decides
    // whether that is worth re-linking for.
    return { ok: false, reason: "GRAPHQL_ERROR", days: [] };
  }

  const entries = normalizeContributionCalendar(payload);
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  return { ok: true, days: entries, total, from, to };
}

/**
 * Persist the calendar as a per-day floor next to the webhook counters.
 *
 * `GREATEST` is the whole safety property: syncing twice, or syncing a day the
 * webhook already recorded, can only keep the larger number. It can never add,
 * so a retried sync cannot inflate a member's activity.
 */
export async function recordContributionCalendar({
  sql,
  userId,
  tenantId,
  days
}) {
  if (!Array.isArray(days) || days.length === 0) return 0;
  const rows = days
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(String(entry?.day || "")))
    .map((entry) => ({ day: entry.day, count: Math.max(0, Math.floor(Number(entry.count) || 0)) }))
    .filter((entry) => entry.count > 0);
  if (rows.length === 0) return 0;

  await sql`
    INSERT INTO public.student_daily_activity
      (student_id, day, tenant_id, commits, pull_requests, reviews, score, github_contributions)
    SELECT ${userId}, x.day, ${tenantId ?? null}::uuid, 0, 0, 0, 0, x.count
    FROM jsonb_to_recordset(${sql.json(rows)}::jsonb) AS x(day date, count integer)
    ON CONFLICT (student_id, day) DO UPDATE SET
      github_contributions = GREATEST(
        public.student_daily_activity.github_contributions,
        EXCLUDED.github_contributions
      ),
      tenant_id = COALESCE(public.student_daily_activity.tenant_id, EXCLUDED.tenant_id)
  `;
  return rows.length;
}

/**
 * Fetch and store in one step. Returns a small result object instead of
 * throwing so both the sync route and the OAuth callback can treat the calendar
 * as best-effort.
 */
export async function syncContributionCalendar({
  sql,
  userId,
  tenantId,
  accessToken,
  days = CONTRIBUTION_DAYS,
  now = Date.now(),
  timeoutMs = 12_000,
  fetchImpl = fetch
}) {
  if (!userId || !sql) return { ok: false, reason: "NO_CONTEXT", days: 0, total: 0 };
  const fetched = await fetchContributionCalendar({ accessToken, days, now, timeoutMs, fetchImpl });
  if (!fetched.ok) {
    return { ok: false, reason: fetched.reason, days: 0, total: 0 };
  }
  try {
    const written = await recordContributionCalendar({
      sql,
      userId,
      tenantId,
      days: fetched.days
    });
    await sql`
      UPDATE public.github_connections
         SET contributions_synced_at = NOW()
       WHERE user_id = ${userId}
    `;
    return { ok: true, days: written, total: fetched.total };
  } catch {
    return { ok: false, reason: "WRITE_FAILED", days: 0, total: 0 };
  }
}

// A page view may repair the grid on its own, but at most this often. Without a
// bound, every render would spend a GitHub request; with one, a member who
// linked before this feature existed sees real squares on their next visit.
export const CALENDAR_SYNC_AGE_MS = 6 * 60 * 60_000;

export function calendarSyncDue(lastSyncedAt, now = Date.now(), maxAgeMs = CALENDAR_SYNC_AGE_MS) {
  if (!lastSyncedAt) return true;
  const at = lastSyncedAt instanceof Date ? lastSyncedAt.getTime() : new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(at)) return true;
  return at <= now - maxAgeMs;
}
