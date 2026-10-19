// Launch-data cleanup: removes development seeds, demo accounts, E2E fixtures,
// and stale test aggregates. Base product content (departments, roadmap nodes,
// resources, FAQs, curated OSS repos, the tenant) is deliberately preserved.
//
// Usage:
//   node load/clean-launch-data.js              # dry run, rolls back
//   node load/clean-launch-data.js --confirm    # commits
//
// Safety: everything runs in one transaction. The dry run performs the same
// deletes and then rolls back, so the printed row counts are exact.
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const CONFIRM = process.argv.includes("--confirm");

// Fixed seed ids are not auth users.
const SEED_IDS = [
  "seed-user-aarav",
  "seed-user-priya",
  "seed-user-rahul",
  "seed-user-sneha",
  "seed-user-kabir"
];

// Unambiguous non-production accounts. `aloha` is intentionally left for manual
// review: it is empty, but it has a real-looking auth identity.
const TEST_ACCOUNTS = [
  { id: "a5d8fed0-4841-4ab2-8f82-d019d88c6f42", email: "e2e.student@example.com", label: "E2E Student" },
  { id: "52a74bd4-621c-4661-80a4-5fa8a1fab1af", email: "debug-student@loom.test", label: "debug student" },
  { id: "ad724b6e-5a64-4a69-8110-1c584d1d600b", email: "lapexa7556@copytosh.com", label: "Mayank Somvanshi (fake acc)" },
  { id: "a7fcd301-d71f-4158-978e-2f0452851631", email: "viptremoryt@gmail.com", label: "John Doe" },
  { id: "226095e5-138e-4136-b58d-e59b0f4a8a88", email: "gesadag931@betshubs.com", label: "Fabiano Marijuana" }
];

const TEST_IDS = TEST_ACCOUNTS.map((a) => a.id);
const ALL_IDS = [...SEED_IDS, ...TEST_IDS];

// Columns that can point at a member. Kept broad so test-account rows are not
// left behind in less obvious tables.
const USER_COLUMNS = [
  "user_id", "student_id", "actor_id", "owner_id", "created_by", "submitted_by",
  "mentor_id", "author_id", "reviewer_id", "verified_by", "requested_by",
  "assigned_to", "recipient_id", "from_user_id", "to_user_id", "uploaded_by",
  "follower_id", "following_id", "sender_id", "receiver_id", "endorsee_id",
  "endorser_id", "requester_id", "helper_id", "head_user_id", "co_head_user_id",
  "logged_by", "done_by", "decided_by"
];

class DryRun extends Error {}

const sql = postgres(databaseUrl(), { max: 2, prepare: false });
const report = [];

function note(operation, rows) {
  report.push({ operation, rows: Number(rows?.count ?? rows?.length ?? 0) });
}

async function main() {
  const target = (await sql`
    SELECT current_database() AS db, current_user AS usr, inet_server_addr()::text AS host
  `)[0];
  console.log(`target: ${target.db} @ ${target.host} (${target.usr})`);
  console.log(CONFIRM ? "mode: COMMIT" : "mode: DRY RUN (will roll back)");

  const columns = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = ANY(${USER_COLUMNS})
    ORDER BY table_name, column_name
  `;

  try {
    await sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL statement_timeout = '60s'");

      // Child rows first, profiles last, so FK references never block deletion.
      const ordered = [
        ...columns.filter((c) => c.table_name !== "profiles"),
        ...columns.filter((c) => c.table_name === "profiles")
      ];
      for (const { table_name, column_name } of ordered) {
        const result = await tx.unsafe(
          `DELETE FROM public."${table_name}" WHERE "${column_name}"::text = ANY($1)`,
          [ALL_IDS]
        );
        if (result.count) note(`${table_name}.${column_name}`, result);
      }

      // Seed markers that are not keyed to a seed user id.
      note("contests (Seed*)", await tx.unsafe("DELETE FROM public.contests WHERE title LIKE 'Seed%'"));
      note("projects (test titles)", await tx.unsafe(`
        DELETE FROM public.projects
        WHERE title IN ('great project', 'hiflow', 'E2E fixture project')
      `));
      note("events (test titles)", await tx.unsafe(`
        DELETE FROM public.events
        WHERE title IN ('Hallucination', 'redistribution')
           OR (title = 'Git & GitHub hands-on' AND created_by IS NULL)
      `));
      note("github_events (seed-*)", await tx.unsafe("DELETE FROM public.github_events WHERE idempotency_key LIKE 'seed-%'"));
      note("repositories (seed-repo-*)", await tx.unsafe("DELETE FROM public.repositories WHERE id LIKE 'seed-repo-%'"));
      note("audit_logs (actor seed)", await tx.unsafe("DELETE FROM public.audit_logs WHERE actor_id = 'seed'"));
      note("page_views (smoke test)", await tx.unsafe("DELETE FROM public.page_views WHERE visitor_key LIKE 'smoke-test%'"));
      note("cohort_metrics (stale seed rollup)", await tx.unsafe("DELETE FROM public.cohort_metrics"));
      note("federation_metrics (stale seed rollup)", await tx.unsafe("DELETE FROM public.federation_metrics"));
      note("notifications (deleted account refs)", await tx.unsafe(`
        DELETE FROM public.notifications
        WHERE body ILIKE '%(fake acc)%'
           OR body ILIKE '%E2E Student%'
           OR body ILIKE '%John Doe%'
           OR body ILIKE '%Fabiano Marijuana%'
           OR body ILIKE '%debug-student%'
           OR title ILIKE '%Seed Sprint%'
           OR body ILIKE '%Seed Sprint%'
      `));

      // Remove the test auth users themselves (auth identities/sessions cascade).
      if (TEST_IDS.length) {
        note("auth.users (test accounts)", await tx.unsafe(
          "DELETE FROM auth.users WHERE id::text = ANY($1)",
          [TEST_IDS]
        ));
      }

      // Refresh the public chapter card from the remaining real rows.
      note("chapter_profiles.public_stats", await tx.unsafe(`
        UPDATE public.chapter_profiles c
        SET public_stats = jsonb_build_object(
              'members', (SELECT COUNT(*)::int FROM public.profiles p WHERE p.tenant_id = c.tenant_id),
              'oss_contributions', (SELECT COUNT(*)::int FROM public.student_oss_contributions o
                                    WHERE o.tenant_id = c.tenant_id AND o.status = 'verified')
            ),
            updated_at = now()
        WHERE c.is_public = true
      `));

      if (!CONFIRM) throw new DryRun();
    });
    console.log("\nCommitted.");
  } catch (e) {
    if (e instanceof DryRun) {
      console.log("\nDry run complete; transaction rolled back. No data changed.");
    } else {
      throw e;
    }
  }

  console.log("\nPlanned deletions:");
  console.table(report);

  const [left] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM profiles WHERE user_id LIKE 'seed-user-%') AS seed_profiles,
      (SELECT COUNT(*)::int FROM profiles WHERE user_id::text = ANY(${TEST_IDS})) AS test_profiles,
      (SELECT COUNT(*)::int FROM projects WHERE title IN ('great project','hiflow','E2E fixture project')) AS test_projects,
      (SELECT COUNT(*)::int FROM events WHERE title IN ('Hallucination','redistribution') OR (title='Git & GitHub hands-on' AND created_by IS NULL)) AS test_events,
      (SELECT COUNT(*)::int FROM contests WHERE title LIKE 'Seed%') AS seed_contests,
      (SELECT COUNT(*)::int FROM audit_logs WHERE actor_id='seed') AS seed_audit,
      (SELECT COUNT(*)::int FROM cohort_metrics) AS stale_cohorts,
      (SELECT COUNT(*)::int FROM federation_metrics) AS stale_federation
  `;
  console.log("\nRemaining dummy markers:");
  console.table([left]);

  const [review] = await sql`
    SELECT p.user_id::text, p.name, ui.email
    FROM profiles p
    LEFT JOIN user_identities ui ON ui.user_id::text = p.user_id::text
    WHERE p.name IN ('aloha')
       OR p.name ILIKE '%test%'
       OR p.name ILIKE '%fake%'
    ORDER BY p.name
  `;
  if (review) {
    console.log("\nNeeds manual review (not deleted automatically):");
    console.table([review]);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
