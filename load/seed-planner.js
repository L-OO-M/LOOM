// Seed the LOOM 2026-27 Collective Master Planner.
//
// Idempotent: weeks, sessions and planner-linked society events are upserted
// per tenant, so re-running is safe and never duplicates a row.
//
// Usage: node load/seed-planner.js
//
// The 20 Nov - 20 Dec 2026 relaxation window is applied while seeding: any
// session whose derived date lands inside it is stored as delivery_mode
// 'deferred' with is_relaxation = true, so it never renders as live. Weeks
// inside the provisional exam window (14 Dec - 3 Jan) are stored as async.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const DATA_FILE = path.join(process.cwd(), "load", "data", "loom-collective-planner-2026.json");

const TRACK_DEFAULTS = {
  dsa: { day: 1, start: "17:00:00", end: "17:45:00", kind: "clinic" },
  ai_ml: { day: 2, start: "17:00:00", end: "18:30:00", kind: "workshop" },
  cybersecurity: { day: 3, start: "17:00:00", end: "18:30:00", kind: "lab" },
  web: { day: 4, start: "17:00:00", end: "19:00:00", kind: "workshop" },
  embedded: { day: 5, start: "17:00:00", end: "19:00:00", kind: "lab" },
  blockchain: { day: 5, start: "17:00:00", end: "19:00:00", kind: "lab" },
};

const REQUIRED_KINDS = new Set(["workshop", "lab", "clinic", "release", "assessment", "checkpoint"]);

function pad2(n) {
  return String(n).padStart(2, "0");
}

function addDays(dateIso, days) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function isRelaxationDate(dateIso, window) {
  return dateIso >= window.start && dateIso <= window.end;
}

function isExamProtected(dateIso) {
  return dateIso >= "2026-12-14" && dateIso <= "2027-01-03";
}

function timestamp(dateIso, time) {
  return `${dateIso}T${(time || "00:00:00").slice(0, 8)}+05:30`;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

async function seedTenant(sql, tenant, plan) {
  const start = plan.startDate;
  let weeks = 0;
  let sessions = 0;
  let events = 0;

  for (const week of plan.weeks) {
    const startsOn = addDays(start, (week.week - 1) * 7);
    const endsOn = addDays(startsOn, 6);
    const relaxation = week.delivery === "deferred" || isRelaxationDate(startsOn, plan.relaxation) && isRelaxationDate(endsOn, plan.relaxation);
    const protectedWeek = isExamProtected(startsOn) || isExamProtected(endsOn);

    let weekMode = "live";
    if (week.delivery) weekMode = week.delivery;
    else if (relaxation) weekMode = "deferred";
    else if (protectedWeek) weekMode = "async";

    await sql`
      INSERT INTO planner_weeks (tenant_id, academic_year, week_number, starts_on, ends_on, theme, delivery_mode, is_protected, is_relaxation, notes)
      VALUES (${tenant.id}, ${plan.academicYear}, ${week.week}, ${startsOn}, ${endsOn}, ${week.theme || ""}, ${weekMode}, ${protectedWeek}, ${relaxation}, ${week.society || ""})
      ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), academic_year, week_number)
      DO UPDATE SET starts_on = EXCLUDED.starts_on, ends_on = EXCLUDED.ends_on, theme = EXCLUDED.theme,
        delivery_mode = EXCLUDED.delivery_mode, is_protected = EXCLUDED.is_protected,
        is_relaxation = EXCLUDED.is_relaxation, notes = EXCLUDED.notes, updated_at = now()
    `;
    weeks += 1;

    for (const [track, entry] of Object.entries(week.tracks || {})) {
      const defaults = TRACK_DEFAULTS[track] || { day: 5, start: "17:00:00", end: "19:00:00", kind: "workshop" };
      const day = entry.day ?? defaults.day;
      const dayIso = addDays(startsOn, day - 1);
      const inRelaxation = isRelaxationDate(dayIso, plan.relaxation);
      const mode = inRelaxation ? "deferred" : entry.mode || (week.delivery === "async" ? "async" : "live");
      const kind = entry.kind || defaults.kind;
      await upsertSession(sql, tenant.id, plan.academicYear, week.week, track, entry.ref, entry.title, kind, {
        day,
        start: entry.start ?? defaults.start,
        end: entry.end ?? defaults.end,
        mode,
        relaxation: inRelaxation,
        required: REQUIRED_KINDS.has(kind),
        notes: week.society || "",
      });
      sessions += 1;

      if (track === "dsa" && week.week <= 26) {
        await upsertSession(sql, tenant.id, plan.academicYear, week.week, track, `${entry.ref}-RELEASE`, "Publish 7 LeetCode links (5 core, 2 stretch)", "release", {
          day: 1,
          start: "09:00:00",
          end: "09:15:00",
          mode: "async",
          relaxation: inRelaxation,
          required: true,
          notes: "Closes Sunday 23:59 IST. Exam deadlines must be announced before release.",
        });
        sessions += 1;
      }
    }
  }

  for (const checkpoint of plan.checkpoints || []) {
    const ref = `CHK-${checkpoint.week}-${slug(checkpoint.title)}`;
    await upsertSession(sql, tenant.id, plan.academicYear, checkpoint.week, checkpoint.track || "general", ref, checkpoint.title, "checkpoint", {
      day: 7,
      start: "18:00:00",
      end: "18:30:00",
      mode: "async",
      relaxation: isRelaxationDate(addDays(start, (checkpoint.week - 1) * 7 + 6), plan.relaxation),
      required: false,
      notes: "Milestone check — reviewed, not a compulsory live session.",
    });
    sessions += 1;
  }

  for (const event of plan.societyEvents || []) {
    const endDate = event.endDate || event.date;
    const startsAt = timestamp(event.date, event.start);
    const endsAt = timestamp(endDate, event.end || event.start);
    await sql`
      INSERT INTO events (tenant_id, event_type, title, description, domain, starts_at, ends_at, location, is_online, status, planner_year, planner_week, planner_kind, planner_ref, planner_status)
      VALUES (${tenant.id}, ${event.type}, ${event.title}, ${event.description || ""}, 'general', ${startsAt}, ${endsAt}, ${event.location || null}, false, ${event.status || "upcoming"}, ${plan.academicYear}, ${event.week}, ${event.kind || event.type}, ${event.ref}, 'scheduled')
      ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), planner_ref) WHERE planner_ref IS NOT NULL
      DO UPDATE SET event_type = EXCLUDED.event_type, title = EXCLUDED.title, description = EXCLUDED.description,
        starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, location = EXCLUDED.location,
        status = EXCLUDED.status, planner_year = EXCLUDED.planner_year, planner_week = EXCLUDED.planner_week,
        planner_kind = EXCLUDED.planner_kind
    `;
    events += 1;
  }

  return { weeks, sessions, events };
}

async function upsertSession(sql, tenantId, year, weekNumber, track, ref, title, kind, opts) {
  await sql`
    INSERT INTO planner_sessions (tenant_id, academic_year, week_number, track_domain, curriculum_ref, title, description, session_kind, day_of_week, starts_time, ends_time, delivery_mode, is_required, is_relaxation, notes)
    VALUES (${tenantId}, ${year}, ${weekNumber}, ${track}, ${ref}, ${title}, '', ${kind}, ${opts.day}, ${opts.start}, ${opts.end}, ${opts.mode}, ${opts.required}, ${opts.relaxation}, ${opts.notes || ""})
    ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), academic_year, track_domain, curriculum_ref) WHERE curriculum_ref IS NOT NULL
    DO UPDATE SET week_number = EXCLUDED.week_number, title = EXCLUDED.title, session_kind = EXCLUDED.session_kind,
      day_of_week = EXCLUDED.day_of_week, starts_time = EXCLUDED.starts_time, ends_time = EXCLUDED.ends_time,
      delivery_mode = EXCLUDED.delivery_mode, is_required = EXCLUDED.is_required, is_relaxation = EXCLUDED.is_relaxation,
      notes = EXCLUDED.notes, updated_at = now()
  `;
}

async function main() {
  const plan = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const sql = postgres(databaseUrl(), { max: 1, connect_timeout: 20 });
  try {
    const tenants = await sql`SELECT id, slug FROM tenants ORDER BY created_at ASC`;
    if (!tenants.length) {
      console.log("No tenants found — seed a tenant first.");
      return;
    }
    for (const tenant of tenants) {
      const counts = await seedTenant(sql, tenant, plan);
      console.log(`planner: ${tenant.slug} — ${counts.weeks} weeks, ${counts.sessions} sessions, ${counts.events} society events`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
