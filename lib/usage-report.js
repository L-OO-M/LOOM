/**
 * Load and shape the usage report for one chapter.
 *
 * Two queries, sequential (pooler rule): the aggregates and the tour funnels.
 * Both are pre-rolled-up tables, so this stays flat no matter how much raw
 * traffic the chapter produces.
 *
 * `navSlots()` turns the real navigation model into the destinations a member
 * is meant to find. That is what makes "hard to reach" a statement about the
 * shell - a route the nav advertises but nobody opens - rather than a guess
 * from raw traffic alone.
 */
import { adminNav, leadNav, studentNav } from "./nav";
import { USAGE_WINDOW_DAYS, dailySeries, hardToReach, summarizeRoutes, tourReport } from "./usage";

const NAV_BY_AREA = [
  ["student", studentNav],
  ["lead", leadNav],
  ["admin", adminNav]
];

export function navSlots() {
  const slots = [];
  for (const [area, nav] of NAV_BY_AREA) {
    for (const item of nav || []) {
      if (typeof item.href === "string" && item.href.startsWith("/") && item.icon !== "profile") {
        slots.push({ id: `${area}-${item.id}`, label: item.label, path: item.href, area });
      }
      for (const child of item.children || []) {
        if (typeof child.href === "string" && child.href.startsWith("/")) {
          slots.push({ id: `${area}-${child.id}`, label: `${item.label} / ${child.label}`, path: child.href, area });
        }
      }
    }
  }
  return slots;
}

const EMPTY = Object.freeze({
  routes: { routes: [], most: [], least: [], totals: { views: 0, signedIn: 0, sessions: 0, signedInShare: 0, routes: 0, areas: 0 } },
  tours: [],
  series: [],
  unreachable: []
});

/**
 * @param {Function} sql request connection
 * @param {{ tenantId?: string, days?: number }} options
 */
export async function loadUsageReport(sql, { tenantId, days = USAGE_WINDOW_DAYS } = {}) {
  const windowDays = Math.max(1, Math.min(180, Math.round(Number(days) || USAGE_WINDOW_DAYS)));
  if (!tenantId) return { ...EMPTY, empty: true, windowDays };

  const usage = await sql`
    SELECT day, area, path, views, visitors, signed_in, sessions
    FROM usage_daily
    WHERE tenant_id = ${tenantId}::uuid
      AND day >= CURRENT_DATE - make_interval(days => ${windowDays})
    ORDER BY day ASC, views DESC
  `;
  const tourRows = await sql`
    SELECT day, tour, version, started, completed, skipped, steps
    FROM tour_daily
    WHERE tenant_id = ${tenantId}::uuid
      AND day >= CURRENT_DATE - make_interval(days => ${windowDays})
    ORDER BY day ASC
  `;

  if (usage.length === 0 && tourRows.length === 0) {
    return { ...EMPTY, empty: true, windowDays };
  }

  const routes = summarizeRoutes(usage);
  return {
    empty: usage.length === 0,
    windowDays,
    routes,
    tours: tourReport(tourRows),
    series: dailySeries(usage),
    unreachable: hardToReach(navSlots(), routes.routes)
  };
}
