// Annual leadership rotation: expire terms that have ended, notify the holder
// and the chapter admins, and put the handover on the checklist.
//
// The live role stays on the profile for history. Authority is suspended by
// lib/permissions.js (`effectiveRole` -> core) as soon as role_term_end has
// passed, so an expired lead cannot act between this job and reappointment.
//
// Usage:
//   node load/expire-terms.js            # dry run
//   node load/expire-terms.js --apply    # write notifications + markers
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const apply = process.argv.includes("--apply");
const sql = postgres(databaseUrl(), { max: 1 });

try {
  const rows = await sql`
    SELECT t.id, t.tenant_id, t.user_id, t.role, t.vertical, t.department_id,
           t.starts_on, t.ends_on, p.name, d.name AS department_name
    FROM leadership_terms t
    JOIN profiles p ON p.user_id = t.user_id
    LEFT JOIN departments d ON d.id = t.department_id
    WHERE t.status = 'active'
      AND t.ends_on IS NOT NULL
      AND t.ends_on < CURRENT_DATE
    ORDER BY t.ends_on ASC
  `;

  console.log(`TERM EXPIRY ${apply ? "(applying)" : "(dry run — pass --apply to write)"}`);
  if (rows.length === 0) {
    console.log("No ended terms found.");
  }

  for (const t of rows) {
    const label = t.role === "dept_lead"
      ? `Head / Co-Head — ${t.department_name || "department"}`
      : t.role === "vertical_lead"
        ? `Vertical Lead — ${t.vertical || "vertical"}`
        : t.role === "admin"
          ? "Super Admin"
          : "Core Member";
    console.log(`  ${t.name || t.user_id} · ${label} · ended ${t.ends_on}`);

    if (!apply) continue;

    await sql.begin(async (tx) => {
      await tx`
        UPDATE leadership_terms SET status = 'expired', notified_at = NOW()
        WHERE id = ${t.id} AND status = 'active'
      `;

      await tx`
        INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
        VALUES (
          ${t.tenant_id}, ${t.user_id}, 'term_expired',
          ${`Your ${label} term has ended`},
          ${"Your leadership term ended on " + t.ends_on + ". You keep your history; reappointment or extension is required before you can act in that role again."},
          '/student/settings'
        )
      `;

      await tx`
        INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
        SELECT ${t.tenant_id}, p.user_id, 'term_expired',
               ${`Term ended: ${t.name || t.user_id} — ${label}`},
               ${"Reappoint, extend, or complete the handover. Authority in the old term is already suspended."},
               '/admin/handover'
        FROM profiles p
        WHERE p.role = 'admin'
          AND (p.tenant_id = ${t.tenant_id}::uuid OR ${t.tenant_id}::uuid IS NULL)
          AND p.user_id <> ${t.user_id}
      `;

      const title = `Reappoint or hand over: ${label}`;
      const [existing] = await tx`
        SELECT id FROM handover_checklists
        WHERE title = ${title}
          AND (tenant_id = ${t.tenant_id}::uuid OR ${t.tenant_id}::uuid IS NULL)
        LIMIT 1
      `;
      if (!existing) {
        await tx`
          INSERT INTO handover_checklists (tenant_id, title, category, detail)
          VALUES (
            ${t.tenant_id}, ${title}, 'leadership',
            ${`Term ended ${t.ends_on}. Holder: ${t.name || t.user_id}. Reappoint or transfer ownership.`}
          )
        `;
      }

      await tx`
        INSERT INTO audit_logs (actor_id, tenant_id, action, resource, resource_id, after, metadata)
        VALUES (
          ${t.user_id}, ${t.tenant_id}, 'term_expired', 'leadership_terms', ${t.id},
          ${tx.json({ role: t.role, ends_on: t.ends_on })},
          ${tx.json({ tenant_id: t.tenant_id })}
        )
      `;
    });
  }

  console.log(`\n${rows.length} term${rows.length === 1 ? "" : "s"} ${apply ? "expired" : "would expire"}.`);
  if (!apply && rows.length > 0) console.log("Dry run. Re-run with --apply to expire and notify.");
} finally {
  await sql.end();
}
