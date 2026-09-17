// Analytics service — SaaS dashboard data from REAL chapter rows.
// Every number here comes from nightly rollups (cohort_metrics,
// student_analytics_snapshots) or live tables (activity, progress,
// projects, sessions). Empty tenant => honest zeros + empty states,
// never fabricated metrics. Pure helpers stay unit-testable (no DB).

export const PERIODS = ["daily", "monthly", "yearly"];

export function normalizePeriod(p) {
  return PERIODS.includes(p) ? p : "monthly";
}

// Compact display: 23876 -> "23,876". Locale grouping, no rounding games.
export function compact(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US");
}

// Percent change vs previous bucket. Returns { pct, trend } where
// trend is "up" | "down" | "flat". Division-by-zero yields 0/flat.
export function changePct(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev <= 0) return { pct: 0, trend: cur > 0 ? "up" : "flat" };
  const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
  return { pct: Math.abs(pct), trend: pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat" };
}

// Bucket boundaries for each period, newest-first labels included.
export function bucketsFor(period) {
  const now = new Date();
  const out = [];
  if (period === "daily") {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      out.push({
        key: iso,
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        start: `${iso}T00:00:00.000Z`,
        end: new Date(d.getTime() + 86400000).toISOString(),
      });
    }
    return out;
  }
  if (period === "yearly") {
    const y = now.getFullYear();
    for (let yr = y - 3; yr <= y; yr++) {
      out.push({
        key: String(yr),
        label: String(yr),
        start: `${yr}-01-01T00:00:00.000Z`,
        end: `${yr + 1}-01-01T00:00:00.000Z`,
      });
    }
    return out;
  }
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({
      key,
      label: d.toLocaleDateString("en-US", { month: "short" }),
      start: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString(),
    });
  }
  return out;
}

export function bucketKeyFor(iso, period) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (period === "daily") return d.toISOString().slice(0, 10);
  if (period === "yearly") return String(d.getUTCFullYear());
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Fold raw dated rows into the period buckets. valueOf picks the
// numeric contribution of a row (defaults to 1 = count rows).
export function foldIntoBuckets(buckets, rows, dateOf, valueOf = () => 1, period = "monthly") {
  const byKey = new Map(buckets.map((b) => [b.key, 0]));
  for (const r of rows || []) {
    const k = bucketKeyFor(dateOf(r), period);
    if (k && byKey.has(k)) byKey.set(k, byKey.get(k) + valueOf(r));
  }
  return buckets.map((b) => ({ key: b.key, label: b.label, value: byKey.get(b.key) || 0 }));
}

// Distinct-student counts per bucket from activity rows
// ({ student_id, day }). Pure — the query stays in getSummary.
export function distinctPerBucket(buckets, rows, dateOf, idOf, period = "monthly") {
  const sets = new Map(buckets.map((b) => [b.key, new Set()]));
  for (const r of rows || []) {
    const k = bucketKeyFor(dateOf(r), period);
    if (k && sets.has(k)) sets.get(k).add(idOf(r));
  }
  return buckets.map((b) => ({ key: b.key, label: b.label, value: sets.get(b.key).size }));
}

// Weekday distribution (Mon..Sun) of activity volume. Pure.
export function weekdayDistribution(rows) {
  const days = [0, 0, 0, 0, 0, 0, 0]; // Mon..Sun
  for (const r of rows || []) {
    const d = new Date(r.day || r.date);
    if (Number.isNaN(d.getTime())) continue;
    const idx = (d.getDay() + 6) % 7;
    days[idx] += Number(r.commits || 0) + Number(r.pull_requests || 0) + Number(r.reviews || 0);
  }
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const max = Math.max(1, ...days);
  return labels.map((label, i) => ({ label, value: days[i], ratio: days[i] / max }));
}

// ---- Traffic tops from first-party page views (pure, tested) ----

export function hostOf(ref) {
  if (!ref) return null;
  try {
    return new URL(ref).hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

const SEARCH_HOSTS = ["google", "bing", "duckduckgo", "yahoo", "baidu", "yandex", "ecosia"];
const SOCIAL_HOSTS = ["twitter", "x.com", "facebook", "instagram", "linkedin", "youtube", "reddit", "tiktok", "discord"];

export function sourceFor(host) {
  if (!host) return "Direct";
  if (SEARCH_HOSTS.some((s) => host.includes(s))) return "Organic Search";
  const root = host.split(".")[0];
  if (SOCIAL_HOSTS.some((s) => host === s || host.endsWith(`.${s}`) || root === s || root === s.split(".")[0])) return "Social";
  if (host.includes("mail") || host.includes("newsletter") || host.includes("substack")) return "Email";
  return "Referral";
}

function topBy(rows, keyOf, limit = 5) {
  const counts = new Map();
  for (const r of rows || []) {
    const k = keyOf(r) || "Direct";
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ id: label, label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function topReferrers(viewRows, limit = 5) {
  return topBy(viewRows, (v) => hostOf(v.referrer), limit);
}

export function topPages(viewRows, limit = 5) {
  return topBy(viewRows, (v) => v.path || "/", limit);
}

export function topSources(viewRows) {
  const counts = new Map();
  for (const v of viewRows || []) {
    const s = sourceFor(hostOf(v.referrer));
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  const total = Math.max(1, (viewRows || []).length);
  return [...counts.entries()]
    .map(([label, count]) => ({ id: label, label, count, pct: Math.round((count / total) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Server query: full dashboard summary for one tenant + period.
// Queries stay sequential (pooler rule). One call feeds every tab.
export async function getAnalyticsSummary(sql, tenantId, periodRaw) {
  const period = normalizePeriod(periodRaw);
  const buckets = bucketsFor(period);
  const spanStart = buckets[0].start;
  const spanDays = period === "daily" ? 14 : period === "monthly" ? 365 : 1460;
  const prevStart = new Date(new Date(spanStart).getTime() - spanDays * 86400000).toISOString();

  const activity = await sql`
    SELECT student_id, day, commits, pull_requests, reviews FROM student_daily_activity
    WHERE day >= ${prevStart}::timestamptz
    ORDER BY day ASC LIMIT 5000
  `;
  const completions = await sql`
    SELECT completed_at FROM student_roadmap_progress
    WHERE status = 'completed' AND completed_at >= ${prevStart}::timestamptz
    ORDER BY completed_at ASC LIMIT 5000
  `;
  const projects = await sql`
    SELECT id, title, created_at FROM projects
    WHERE created_at >= ${prevStart}::timestamptz
    ORDER BY created_at DESC LIMIT 200
  `;
  const sessions = await sql`
    SELECT id, status, scheduled_at, created_at FROM mentor_sessions
    WHERE COALESCE(scheduled_at, created_at) >= ${prevStart}::timestamptz
    ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 500
  `;
  const views = await sql`
    SELECT visitor_key, user_id, path, referrer, created_at FROM page_views
    WHERE tenant_id = ${tenantId}::uuid AND created_at >= ${prevStart}::timestamptz
    ORDER BY created_at ASC LIMIT 20000
  `;
  const [eventCounts] = await sql`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE starts_at >= ${spanStart}::timestamptz)::int AS cur,
      COUNT(*) FILTER (WHERE starts_at >= ${prevStart}::timestamptz AND starts_at < ${spanStart}::timestamptz)::int AS prev
    FROM events WHERE tenant_id = ${tenantId}::uuid
  `;
  const funnel = await sql`
    SELECT n.node_id, n.total_started, n.total_completed, n.drop_off_pct, r.title, r.domain
    FROM roadmap_node_analytics n LEFT JOIN roadmap_nodes r ON r.id = n.node_id
    WHERE n.tenant_id = ${tenantId}::uuid AND n.total_started > 0
    ORDER BY n.total_completed DESC LIMIT 12
  `;
  const [health] = await sql`
    SELECT * FROM cohort_metrics WHERE tenant_id = ${tenantId}::uuid
    ORDER BY cohort_date DESC LIMIT 1
  `;
  const events = await sql`
    SELECT e.id, e.title, e.starts_at,
      (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id) AS regs
    FROM events e WHERE e.tenant_id = ${tenantId}::uuid
    ORDER BY e.starts_at DESC LIMIT 12
  `;
  const topResources = await sql`
    SELECT g.id, g.title, g.domain, COUNT(*)::int AS done
    FROM resource_progress p JOIN resources g ON g.id = p.resource_id
    GROUP BY g.id, g.title, g.domain ORDER BY done DESC LIMIT 8
  `;
  const contests = await sql`
    SELECT k.id, k.title, k.status,
      (SELECT COUNT(*)::int FROM contest_registrations r WHERE r.contest_id = k.id) AS regs,
      (SELECT COUNT(*)::int FROM contest_submissions s WHERE s.contest_id = k.id) AS subs
    FROM contests k ORDER BY k.created_at DESC NULLS LAST LIMIT 6
  `;
  const [oss] = await sql`
    SELECT COUNT(*)::int AS c FROM student_oss_contributions WHERE status = 'verified'
  `;

  const cutoff = new Date(spanStart).getTime();
  const inSpan = (iso) => new Date(iso).getTime() >= cutoff;

  const activeSeries = distinctPerBucket(buckets, (activity || []).filter((a) => inSpan(a.day)), (a) => a.day, (a) => a.student_id, period);
  const doneSeries = foldIntoBuckets(buckets, (completions || []).filter((c) => c.completed_at && inSpan(c.completed_at)), (c) => c.completed_at, () => 1, period);
  const viewRows = (views || []).filter((v) => v.created_at && inSpan(v.created_at));
  const visitorSeries = distinctPerBucket(buckets, viewRows, (v) => v.created_at, (v) => v.user_id || v.visitor_key, period);
  const pageViewSeries = foldIntoBuckets(buckets, viewRows, (v) => v.created_at, () => 1, period);

  // KPI current vs previous equivalent span (visitors + views measured
  // first-party; events from the chapter calendar; live from last 30 min).
  const spanMs = Date.now() - cutoff;
  const prevCut = cutoff - spanMs;
  const prevViews = (views || []).filter((v) => {
    const t = new Date(v.created_at).getTime();
    return v.created_at && t >= prevCut && t < cutoff;
  });
  const uniqInSpan = (rows) => new Set((rows || []).map((r) => r.user_id || r.visitor_key)).size;
  const nowMs = Date.now();
  const liveCur = uniqInSpan((views || []).filter((v) => v.created_at && new Date(v.created_at).getTime() >= nowMs - 30 * 60000));
  const livePrev = uniqInSpan((views || []).filter((v) => {
    const t = new Date(v.created_at).getTime();
    return v.created_at && t >= nowMs - 3600000 && t < nowMs - 1800000;
  }));

  const kpis = [
    {
      id: "visitors", title: "Unique Visitors",
      value: uniqInSpan(viewRows), ...changePct(uniqInSpan(viewRows), uniqInSpan(prevViews)),
    },
    {
      id: "pageviews", title: "Page View",
      value: viewRows.length, ...changePct(viewRows.length, prevViews.length),
    },
    {
      id: "events", title: "Events",
      value: num(eventCounts?.total),
      ...changePct(num(eventCounts?.cur), num(eventCounts?.prev)),
    },
    {
      id: "live", title: "Live Visitor", live: true,
      value: liveCur, ...changePct(liveCur, livePrev),
    },
  ];

  const dist = health?.domain_distribution || {};
  const domains = Object.entries(dist)
    .map(([name, count]) => ({ name, count: num(count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const nodes = (funnel || []).map((f) => ({
    id: f.node_id, title: f.title || f.node_id, domain: f.domain || "general",
    started: num(f.total_started), completed: num(f.total_completed), dropOff: num(f.drop_off_pct),
  }));
  const eventTops = (events || [])
    .map((e) => ({ id: e.id, title: e.title, regs: num(e.regs), when: e.starts_at }))
    .sort((a, b) => b.regs - a.regs)
    .slice(0, 5);
  const resourceTops = (topResources || []).map((r) => ({ id: r.id, title: r.title, domain: r.domain, done: num(r.done) }));
  const traffic = {
    referrers: topReferrers(viewRows),
    pages: topPages(viewRows),
    sources: topSources(viewRows),
  };

  return {
    period,
    generatedAt: new Date().toISOString(),
    kpis,
    series: activeSeries.map((a, i) => ({
      label: a.label, active: a.value, completions: doneSeries[i]?.value || 0,
      visitors: visitorSeries[i]?.value || 0, pageViews: pageViewSeries[i]?.value || 0,
    })),
    behavior: {
      weekdays: weekdayDistribution(activity || []),
      avgConsistency: num(health?.avg_consistency),
      active7d: num(health?.active_students_7d),
      resources: resourceTops,
    },
    performance: {
      funnel: nodes,
      contests: (contests || []).map((c) => ({ id: c.id, title: c.title, status: c.status, regs: num(c.regs), subs: num(c.subs) })),
      ossVerified: num(oss?.c),
    },
    tops: { nodes: nodes.slice(0, 5), domains, events: eventTops },
    traffic,
    projects: (projects || []).slice(0, 5).map((p) => ({ id: p.id, title: p.title, createdAt: p.created_at })),
  };
}
