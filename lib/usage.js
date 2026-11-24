/**
 * Usage reporting, as arithmetic.
 *
 * The nightly rollup (lib/usage-rollup.js) writes `usage_daily` and
 * `tour_daily`; this module turns those rows into the numbers the dashboard
 * shows. It is pure and clock-free so every claim on the page can be reproduced
 * from the same rows in a test.
 *
 * Two rules follow from the data being deliberately thin:
 *
 *  - Visitors are counted per route. Adding them up across routes would count
 *    one person five times, so this module never presents a chapter-wide
 *    "visitors" total. Views and signed-in shares aggregate honestly; people do
 *    not.
 *  - Nothing here knows who a person is. There is no per-member ranking, no
 *    "this student never opened X", and no department attribution: the raw
 *    tables carry a profile id for opted-in accounts but the aggregates
 *    deliberately drop it (migration 109).
 */

export const USAGE_WINDOW_DAYS = 30;

export const AREA_LABELS = Object.freeze({
  public: "Public site",
  student: "Student",
  lead: "Lead",
  admin: "Admin"
});

/**
 * The last `days` COMPLETE UTC days, oldest first. The current day is excluded
 * on purpose: a rollup that keeps rewriting today would report a partial day as
 * if it were the whole thing.
 */
export function dayWindow(now = new Date(), days = 1) {
  const span = Math.max(1, Math.min(180, Math.round(Number(days) || 1)));
  const base = new Date(now);
  const out = [];
  for (let i = span; i >= 1; i -= 1) {
    const day = new Date(base);
    day.setUTCDate(day.getUTCDate() - i);
    out.push(day.toISOString().slice(0, 10));
  }
  return out;
}

/** Below this share of the busiest destination in the same area, a route is "hard to reach". */
export const HARD_TO_REACH_RATIO = 0.05;

function int(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function formatCount(value) {
  return String(int(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function percent(part, whole) {
  const w = Number(whole);
  if (!Number.isFinite(w) || w <= 0) return 0;
  return Math.round((Number(part) / w) * 1000) / 10;
}

/**
 * @param {Array<{area?: string, path?: string, views?: number, visitors?: number, signed_in?: number, signedIn?: number, sessions?: number}>} rows
 */
export function summarizeRoutes(rows = []) {
  const byKey = new Map();
  for (const row of rows || []) {
    const area = String(row?.area || "public");
    const path = String(row?.path || "/");
    const key = `${area}:${path}`;
    const entry = byKey.get(key) || { area, path, views: 0, visitors: 0, signedIn: 0, sessions: 0 };
    entry.views += int(row.views);
    entry.visitors += int(row.visitors);
    entry.signedIn += int(row.signed_in ?? row.signedIn);
    entry.sessions += int(row.sessions);
    byKey.set(key, entry);
  }

  const all = [...byKey.values()]
    .map((entry) => ({ ...entry, signedInShare: percent(entry.signedIn, entry.views) }))
    .sort((a, b) => b.views - a.views || a.path.localeCompare(b.path));

  const totalViews = all.reduce((sum, entry) => sum + entry.views, 0);
  const totalSignedIn = all.reduce((sum, entry) => sum + entry.signedIn, 0);
  const totalSessions = all.reduce((sum, entry) => sum + entry.sessions, 0);

  const withShare = all.map((entry) => ({ ...entry, share: percent(entry.views, totalViews) }));
  return {
    routes: withShare,
    most: withShare.slice(0, 8),
    least: withShare.length > 1 ? withShare.slice(-8).reverse() : [],
    totals: {
      views: totalViews,
      signedIn: totalSignedIn,
      sessions: totalSessions,
      signedInShare: percent(totalSignedIn, totalViews),
      routes: withShare.length,
      areas: new Set(withShare.map((entry) => entry.area)).size
    }
  };
}

/** Daily views per area, oldest first, for the activity chart. Null days are not invented. */
export function dailySeries(rows = []) {
  const byDay = new Map();
  for (const row of rows || []) {
    const day = String(row?.day || "").slice(0, 10);
    if (!day) continue;
    const bucket = byDay.get(day) || {};
    const area = String(row?.area || "public");
    bucket[area] = (bucket[area] || 0) + int(row.views);
    byDay.set(day, bucket);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, areas]) => ({ day, ...areas, total: Object.values(areas).reduce((sum, n) => sum + n, 0) }));
}

/**
 * Merge per-day tour rows into one funnel per tour, newest version only.
 *
 * An old version stops receiving events the day a new one ships, so summing
 * every version would describe a tour nobody is running any more. The version
 * with the most `started` events wins; ties go to the higher version.
 *
 * @param {Array<{tour?: string, version?: number, started?: number, completed?: number, skipped?: number, steps?: Array}>} rows
 */
export function tourReport(rows = []) {
  const byTour = new Map();
  for (const row of rows || []) {
    const tour = String(row?.tour || "student");
    const version = int(row.version) || 1;
    const current = byTour.get(tour);
    if (!current || version > current.version) {
      byTour.set(tour, { tour, version, started: 0, completed: 0, skipped: 0, steps: new Map() });
    }
    const entry = byTour.get(tour);
    if (entry.version !== version) continue;
    entry.started += int(row.started);
    entry.completed += int(row.completed);
    entry.skipped += int(row.skipped);
    for (const step of Array.isArray(row.steps) ? row.steps : []) {
      const index = int(step?.step);
      if (index < 1) continue;
      const known = entry.steps.get(index) || { step: index, id: step?.id || null, reached: 0 };
      known.reached += int(step?.reached);
      if (!known.id && step?.id) known.id = step.id;
      entry.steps.set(index, known);
    }
  }

  return [...byTour.values()].map((entry) => {
    // Step 1 is "reached" by definition of starting; events are dropped by
    // ad-blockers and tab closes, so a stored count below `started` is normal
    // and is shown as-is rather than backfilled from `started`.
    const steps = [...entry.steps.values()].sort((a, b) => a.step - b.step);
    let biggestDrop = null;
    for (let i = 1; i < steps.length; i += 1) {
      const from = steps[i - 1];
      const to = steps[i];
      const lost = from.reached - to.reached;
      if (lost <= 0) continue;
      const dropPct = percent(lost, from.reached);
      if (!biggestDrop || dropPct > biggestDrop.dropPct) {
        biggestDrop = { from: from.step, to: to.step, id: to.id, lost, dropPct };
      }
    }
    return {
      tour: entry.tour,
      version: entry.version,
      started: entry.started,
      completed: entry.completed,
      skipped: entry.skipped,
      completionRate: percent(entry.completed, entry.started),
      skipRate: percent(entry.skipped, entry.started),
      steps: steps.map((step) => ({ ...step, shareOfStart: percent(step.reached, entry.started) })),
      biggestDrop
    };
  });
}

/**
 * Navigation slots that get almost no traffic for their prominence.
 *
 * A slot is a destination the shell puts in front of people: a top-level nav
 * entry. "Hard to reach" means it draws under 5% of the busiest destination in
 * the same workspace. That is a route-level signal, not a verdict - a settings
 * page is meant to be quiet - so the UI always shows the raw counts beside it.
 *
 * @param {Array<{id: string, label: string, path: string, area?: string}>} slots
 * @param {Array<{path: string, area: string, views: number}>} routes
 */
export function hardToReach(slots = [], routes = []) {
  const viewsByKey = new Map(
    (routes || []).map((entry) => [`${entry.area}:${entry.path}`, int(entry.views)])
  );
  const topByArea = new Map();
  for (const entry of routes || []) {
    const area = String(entry.area || "public");
    topByArea.set(area, Math.max(topByArea.get(area) || 0, int(entry.views)));
  }

  const out = [];
  for (const slot of slots || []) {
    const area = String(slot.area || "public");
    const views = viewsByKey.get(`${area}:${slot.path}`) || 0;
    const top = topByArea.get(area) || 0;
    if (top <= 0) continue;
    const ratio = views / top;
    if (ratio > HARD_TO_REACH_RATIO) continue;
    out.push({
      id: slot.id,
      label: slot.label,
      path: slot.path,
      area,
      views,
      topViews: top,
      shareOfTop: Math.round(ratio * 1000) / 10
    });
  }
  return out.sort((a, b) => a.views - b.views || a.label.localeCompare(b.label));
}

/**
 * Cards for the "chapter read" section. Same shape as lib/insights.js so they
 * render through InsightCards; the denominators are printed so a card can be
 * checked against the table below it.
 */
export function usageInsights({ routes, tours, unreachable } = {}) {
  const out = [];
  const totals = routes?.totals || { views: 0 };
  const most = routes?.most?.[0] || null;
  const tourRows = Array.isArray(tours) ? tours : [];
  const tour = tourRows[0] || null;
  const gaps = Array.isArray(unreachable) ? unreachable : [];

  if (totals.views > 0 && most) {
    out.push({
      id: "usage-top-route",
      tone: "win",
      title: `${most.path} is the busiest screen`,
      body: `${formatCount(most.views)} of ${formatCount(totals.views)} page views in the last 30 days opened it (${most.share}%). ${most.signedInShare}% of those views were signed in.`,
      metric: `${formatCount(most.views)} views`,
      weight: 40
    });
  }

  if (tour && tour.started >= 5) {
    const drop = tour.biggestDrop;
    if (drop && drop.dropPct >= 40) {
      out.push({
        id: "usage-tour-drop",
        tone: "watch",
        title: `The tour loses ${drop.dropPct}% between two steps`,
        body: `${formatCount(drop.lost)} of the people who reached step ${drop.from} never reached step ${drop.to}. That is the step to rewrite first - either the copy is unclear or the target is off-screen on a phone.`,
        metric: `${drop.dropPct}% drop`,
        action: { label: "Replay the tour", href: "/student?tour=1" },
        weight: 220 + drop.dropPct
      });
    }
    if (tour.completionRate < 50) {
      out.push({
        id: "usage-tour-completion-low",
        tone: "risk",
        title: `Only ${tour.completionRate}% finish the tour`,
        body: `${formatCount(tour.completed)} completed and ${formatCount(tour.skipped)} skipped out of ${formatCount(tour.started)} starts. A tour that is skipped is a tax on every new member; shorten it before adding steps.`,
        metric: `${tour.completionRate}% complete`,
        action: { label: "Replay the tour", href: "/student?tour=1" },
        weight: 260 + (50 - tour.completionRate)
      });
    } else if (tour.completionRate >= 75) {
      out.push({
        id: "usage-tour-completion-high",
        tone: "win",
        title: `${tour.completionRate}% finish the tour`,
        body: `${formatCount(tour.completed)} of ${formatCount(tour.started)} starts reached the end. Keep the length; it is not the reason someone is stuck.`,
        metric: `${tour.completionRate}% complete`,
        weight: 35
      });
    }
  }

  if (gaps.length > 0) {
    const gap = gaps[0];
    out.push({
      id: "usage-hard-to-reach",
      tone: "next",
      title: `${gap.label} is hard to reach`,
      body: `${formatCount(gap.views)} views against ${formatCount(gap.topViews)} for the busiest screen in the same workspace (${gap.shareOfTop}%). Either the label does not promise the right thing, or the route is buried.`,
      metric: `${gap.shareOfTop}% of the top route`,
      action: { label: "Open it", href: gap.path },
      weight: 120 + (HARD_TO_REACH_RATIO * 100 - gap.shareOfTop)
    });
  }

  return out;
}
