# Database Reference

Single shared Postgres (Supabase + pooler). Tracked migrations in `load/migrations/`, applied in order by `node load/migrate.js` (`npm run db:migrate`). All DDL is idempotent (`IF NOT EXISTS`).

## Migration order

| # | File | Adds |
|---|------|------|
| 001 | `001_foundation.sql` | tenant scoping, progress upsert key, projects, contest regs/subs, mentors, sessions |
| 002 | `002_contests_created_at.sql` | `contests.created_at` |
| 003 | `003_activity_unique.sql` | daily-activity uniqueness |
| 004 | `004_resource_kind.sql` | `resources.kind` |
| 005 | `005_resource_course_kind.sql` | `course` kind |
| 006 | `006_oss_chapters.sql` | OSS portal + federation + hot-path indexes |
| 007 | `007_credentials.sql` | badges, achievements, verifiable credentials |
| 008 | `008_analytics.sql` | snapshots, cohorts, funnels, mentor effectiveness |
| 009 | `009_community.sql` | forums, votes/flags, wiki, snippets |
| 010 | `010_events_social.sql` | events, registrations, certificates, profiles, social |
| 011 | `011_quick_wins.sql` | `projects.tags` (GIN), `roadmap_nodes.difficulty_level` + calibration |
| 012 | `012_drop_dead_tables.sql` | drops `users` mirror, `roadmaps`/`roadmap` catalog tables, `leaderboard_snapshots` (see notes inline above) |
| 013 | `013_mentor_applications.sql` | `mentor_applications` (covered under People above) |
| 014 | `014_org_model.sql` | `departments`, `department_memberships`, `profiles.vertical/roll_number/branch` |
| 015 | `015_role_backfill.sql` | data only: legacy `mentor` role → `core` |
| 016 | `016_announcements_contributions.sql` | `announcements`, `member_contributions` |
| 017 | `017_lead_console.sql` | `department_memberships.succession_ready`, `events.department_id`, `events.status` gains `proposed` |
| 018 | `018_faq.sql` | `faqs` |
| 019 | `019_operations.sql` | `volunteer_slots`, `volunteer_signups`, `dept_reports`, `handover_checklists`, `budget_heads`, `expenses`, `sponsorships` |
| 020 | `020_github_pause.sql` | data only: `github_integration` flag off (opt-in ingestion) |
| 021 | `021_head_retention_cleanup.sql` | idempotent repair: clears stale `profiles.vertical` + downgrades orphan `dept_lead` memberships to `core` |
### Migrations 022-035 (RLS rollout, help engine, roadmap graph)

| # | File | Effect |
|---|------|--------|
| 022 | `022_feature_flags_unique.sql` | unique `(tenant_id, key)` on `feature_flags` |
| 023 | `023_roadmap_graph.sql` | `roadmap_edges`; `roadmap_nodes.kind/group_id/is_highlighted/is_optional/x/y` |
| 024 | `024_feature_requests.sql` | `feature_requests`, `feature_request_comments` |
| 025 | `025_rls_tenant_isolation.sql` | adds `tenant_id` to `student_roadmap_progress`, `resource_progress`, `student_daily_activity`, `audit_logs`; first `tenant_isolation_policy` (fail-OPEN — superseded by 031) |
| 026 | `026_db_role_hardening.sql` | revokes all table grants from `PUBLIC`/`anon`/`authenticated`; revokes `CREATE` on schema `public` from them |
| 027 | `027_ranking_evidence.sql` | `ranking_events`, `ranking_scores` + RLS |
| 028 | `028_help_recommendations.sql` | `help_signals`, `helper_profiles`, `help_matches` + RLS (peer-help engine) |
| 029 | `029_certificates_event_student_unique.sql` | unique `(event_id, student_id)` on `certificates` |
| **030** | `030_app_role.sql` | **creates the `loom_app` role** (NOSUPERUSER/NOBYPASSRLS/not owner, `NOLOGIN`) and seeds the `tenant_rls_enforced` flag at `false` |
| **031** | `031_rls_scope.sql` | **the live policy set** — fail-CLOSED `tenant_id::text = current_setting('app.tenant_id', true)` across ~44 tables. Deliberately exempt: `tenants`, `tenant_domains`, `feature_flags`, `platform_admins`, `schema_migrations` (read before any tenant is known) |
| 032 | `032_repair_primary_domain.sql` | data repair |
| **033** | `033_rls_self_read.sql` | `profiles` self-read branch (`user_id = current_setting('app.user_id', true)`) so step 1 of tenant resolution is not denied to everyone |
| 034 | `034_audit_backfill_resweep.sql` | `audit_logs.tenant_id` backfill (data only) |
| 035 | `035_github_handle_uniqueness.sql` | `profiles.github_username` uniqueness |
| 036 | `036_tenant_leading_indexes.sql` | composite indexes led by `tenant_id` |
| **037** | `037_verified_evidence.sql` | **the ranking trust boundary** — see below |
| 038 | `038_github_oauth.sql` | `github_connections` repo-proof columns + `github_repo_grants` (see `docs/21`) |
| 039 | `039_endorsement_controls.sql` | `user_profiles.endorsements_visible` (endorsement opt-out) |
| **040** | `040_media_assets.sql` | **lead-tool storage** — `asset_categories`, `media_assets`, `asset_versions` + fail-closed RLS (see below) |
| **041** | `041_mou.sql` | **MoU database** — `mous`, `mou_documents` (versioned, label-grouped) + fail-closed RLS (see below) |
| **042** | `042_lead_directory.sql` | **leadership directory** — `lead_directory` (current + past tenure, optional account link) + fail-closed RLS (see below) |

### Migration 037 — verified evidence

Changes the ranking ledger from documentation to enforcement:

- **`ranking_events`**: `+ source`, `+ evidence jsonb`, `+ verified_at`; and a
  **`BEFORE INSERT` trigger `ranking_events_require_verification`** that raises
  when `verified_by` is NULL or blank — **for every role, including the owner**.
  No score can be written without a named actor vouching for it.
- **`ranking_scores`**: primary key corrected from `user_id` to
  `(tenant_id, user_id)`. It was `user_id` alone, and `recompute_ranking_scores`
  did `ON CONFLICT (user_id)` without refreshing `tenant_id`, so one row could be
  overwritten across two chapters.
- **`projects`**: `+ repo_full_name`, `+ evidence_state`
  (`provisional|verified|rejected`, default `provisional`), `+ verified_at`,
  `+ verified_by`, and `CHECK (status IN ('active','completed','archived'))`.
- **`student_roadmap_progress`**: `+ evidence_state`, `+ evidence_note`,
  `+ evidence_url`, `+ verified_by`, `+ verified_at`, and
  `CHECK (status IN ('active','completed'))`. The long-declared, never-written
  `evidence_source` column is now populated.
- **`github_events`**: `+ repository_name`, `+ student_id`, `+ tenant_id` with a
  partial index, backfilled from the existing jsonb payload.
- **`ranking_decayed_weight`** re-declared `STABLE` (it was `IMMUTABLE` while
  calling `now()`), with a real multi-step age curve.
- **`ranking_kind_cap(kind)`** added; `recompute_ranking_scores` now filters on
  `verified_by IS NOT NULL`, applies caps, fixes the conflict target, and
  **deletes** scores for users with no verified evidence left — so declining a
  claim genuinely lowers a standing instead of freezing it.
- `feature_flags.ranking_verified` seeded **false**.

Full rationale, weight table and known limits: **[`docs/20-verified-ranking.md`](20-verified-ranking.md)**.

**Any code reading `projects` or `student_roadmap_progress` as evidence MUST
filter on `evidence_state = 'verified'`.** Counted raw, a self-declared row is
indistinguishable from a confirmed one — that is the bug 037 exists to close.

**Read migrations 030/031/033 together with `docs/rls-rollout-runbook.md` before
changing anything about roles or policies.** Three facts that are easy to get
wrong:

1. The **owner** connection (`DATABASE_URL`, role `postgres`) has
   `rolbypassrls = true`, which overrides `FORCE ROW LEVEL SECURITY` entirely.
   Queries running on it are **never** filtered by any policy.
2. `tenant_isolation_policy` denies when `app.tenant_id` is unset. A scoped
   statement must therefore run through `scopedSql()` (`lib/db.js`), which wraps
   it in a transaction with `set_config(..., true)`.
3. `feature_flags` has no RLS on purpose, so `tenant_rls_enforced` is readable
   before a tenant is known — and so any chapter admin can read every chapter's
   flags. It holds configuration, not member data.

Tracked migrations are the single source of truth for schema — there is no ORM mirror. All server queries are parameterized `postgres` template strings via `getSql()` in `lib/db.js` (`{max:10,idle_timeout:10,prepare:false}` for the PgBouncer pooler); tenant config is memoized 60s in `queryTenant()`.

## Tables by area

**Identity & tenancy**: `profiles(user_id unique, name, role, tenant_id, enrollment_number, department, year, primary_domain, onboarding_completed, github_username, classification)` — the single source of truth (the legacy `users` mirror was dropped in migration 012), `tenants(id, slug unique, name, status)`.

**Learn**: `roadmap_nodes(id text PK, title, description, domain, difficulty_level, sort_order)` — no `roadmaps` table; domain is the catalog key (dropped in 012), `student_roadmap_progress(student_id, node_id, status, evidence_source, unique(student,node))`, `resources(id text PK, title, domain, level, kind, url, storage_key, minutes)`, `resource_progress(unique(student,resource))`.

**Build**: `projects(owner_id, tenant_id, title, description, roadmap_node_id, status, repo_url, tags[])`, `repositories`, `github_connections(user_id PK, github_username)`, `github_events(idempotency_key unique, event_name, delivery_id, actor_login, payload)`, `student_daily_activity(student_id, day, commits, pull_requests, reviews, score)`, `open_source_projects(github_repo_url unique, owner, repo_name, difficulty, primary_domain, language, stars, good_first_issues, is_curated, tenant nullable = global)`, `student_oss_contributions(unique(student,pr_url), project FK, status claimed|verified|rejected)`, `oss_badges(unique(student,badge_key))`.

**Compete**: `contests`, `contest_registrations(unique(contest,student))`, `contest_submissions`, `events`, `event_registrations(unique(event,student), check_in_code, feedback)`, `event_materials`, `certificates(verification_code unique)`. Standings computes live via `lib/standings.js` (the `leaderboard_snapshots` table was dropped in 012 — never used).

**People**: `mentors(user_id unique, tenant_id, expertise, bio, available)`, `mentor_applications(unique pending per student, eligibility jsonb snapshot, status pending|approved|rejected)`, `mentor_sessions(mentor_id stores user_id, student_id, status)`, `mentor_reviews(unique(mentor,reviewer), rating 1–5)`, `forum_threads(status visible|hidden, pinned, solved, counters)`, `forum_replies(is_answer)`, `forum_votes(unique(student,type,target))`, `forum_flags(unique(student,type,target))`, `wiki_pages(unique(tenant,slug), version)`, `wiki_edit_requests(status pending|approved|rejected)`, `code_snippets`, `chapter_profiles(tenant unique, slug unique, public_stats jsonb)`, `chapter_partnerships`, `federation_metrics(metric_date unique)`, `user_profiles(user_id unique, username unique, endorsements_visible)`, `followers`, `user_endorsements`.

**Proof & insight**: `skill_badges(tier 1–3)`, `student_achievements(unique(student,badge,source,ref)` + partial unique for sourcerows)`, `verifiable_credentials(id text PK `cred_*`, signature HMAC, view_count)`, `credential_views`, `student_analytics_snapshots(unique(student,date))`, `cohort_metrics(unique(tenant,date))`, `roadmap_node_analytics(unique(node,tenant))`, `mentor_effectiveness(unique(mentor,tenant))`.

**System**: `notifications`, `audit_logs`, `schema_migrations`.

## Key relationships

- `profiles.tenant_id → tenants.id` is the tenancy root; every tenant query filters on it.
- `student_roadmap_progress.node_id → roadmap_nodes.id` (text keys, stable across tenants).
- `student_oss_contributions.project_id → open_source_projects.id`; webhook matches `owner/repo` + author login → profile/github_connection.
- `mentor_sessions.mentor_id` stores `mentors.user_id` (not the uuid PK) — joins go through `profiles.user_id`.
- `verifiable_credentials.achievement_id → student_achievements.id`; signature = HMAC(id, student, type, issuedAt).
- `certificates(event_id, student_id)` issued once per pair at check-in.

## Tables added in 014–020 (org, broadcast, lead console, operations)

**Org (014, data backfill 015)**: `departments(tenant_id, name, slug unique per tenant, vertical technical|non_technical, description, head_user_id, co_head_user_id, is_active)` — 8 seeded rows, non-technical start inactive; `department_memberships(user_id, department_id unique pair, level general|core|dept_lead, core_requested, succession_ready [017])` — the join/request/grant/succession state machine; `profiles` gains `vertical` (VL scope), `roll_number` + `branch` (approval-free signup form). 015 retires the `mentor` role value to `core` (mentorship is capability, not a role).

**Broadcast + ledger (016)**: `announcements(scope society|vertical|department, department_id, vertical, title, body, author_id)` — dept heads post to their own feed only (API-enforced `own_feed`), delivery fans out into `notifications`; `member_contributions(student_id, department_id nullable, kind project|competition|certification|event, title, evidence_url, logged_by)` — single source for certificates, dept reports, and exports; self-logged rows carry `logged_by = student_id`.

**Lead console (017)**: `events.department_id` ties workshops to departments; `events.status` gains `proposed` so dept-level society posts wait in the VL approval queue; `department_memberships.succession_ready` flags future leads for the VL dashboard.

**FAQ (018)**: `faqs((tenant_id, slug) unique, question, answer, sort_order, is_published)` — powers public `/faq` (published only) and `/admin/faq`; `(tenant_id, slug)` is the seed upsert key.

**Operations (019)**: `volunteer_slots(event_id, title, capacity > 0, created_by)` + `volunteer_signups(slot_id, user_id unique pair)` — one seat per member, capacity enforced live in the API; `dept_reports((department_id, month) unique, draft jsonb auto-compiled, status draft|submitted, submitted_by/at)`; `handover_checklists(title, category, detail, done)` — admin-owned continuity items; `budget_heads(name, allocated ≥ 0, vertical nullable = society-wide)` + `expenses(head_id, department_id, amount > 0, status proposed|approved|rejected, created_by, decided_by)` + `sponsorships(name, amount, status pipeline|committed|received, contact)` — the finance snapshot (VLs `recommend_only`, enforced in code).

**Ingestion pause (020, data only)**: no schema change — sets `feature_flags.github_integration = false` per tenant and inserts the row where missing, so webhook deliveries are acked but never stored until enabled at `/admin/flags`.

**Head retention cleanup (021, idempotent repair)**: no new columns — repairs drift from earlier promotion paths: clears `profiles.vertical` where `role <> 'vertical_lead'` and downgrades orphaned `department_memberships.level='dept_lead'` to `core` when the owner no longer holds a leading role (preserves engagement history, capability is revoked).

**Lead-tool storage (040)**: `asset_categories((tenant_id, slug) unique, name, sort_order)` — seeded per tenant (Logos, Signatures, Templates, MoU Templates, Banners, Posters, Presentations, Documents) by `node load/setup-storage.js`; `media_assets(category_id, kind logo|signature|template|document|image|link|other, title, tags[], storage_path, external_url, mime_type, size_bytes, current_version, is_active)` — a row has a file **or** an external link (CHECK), never neither; `asset_versions((asset_id, version) unique, storage_path, file_name, mime_type, size_bytes, uploaded_by)` — full history so a replaced logo/template is recoverable. All three are tenant-scoped with the migration-031 fail-closed RLS policy. The bytes live in the private Supabase Storage bucket `loom-files` (path `scope/tenantId/entityId/vN-fileId-name`); only metadata is in Postgres. Shared by the Media & Creative Asset Library and reused for MoU documents and event files.

**MoU database (041)**: `mous(title, partner_name, partner_type sponsor|company|college|community|government|other, summary, status draft|sent|active|expired|terminated, vertical nullable = society-wide, value_amount ≥ 0, value_currency, signed_on/starts_on/ends_on dates, owner_id, notes, expiry_notified_at, is_active)` — one row per agreement; `ends_on` drives the "ending soon" filter and the P5 reminder job (`expiry_notified_at` prevents a second notification, and is reset whenever `ends_on` moves). `mou_documents((mou_id, label, version) unique, storage_path, file_name, mime_type, size_bytes, uploaded_by)` — rows are immutable versions; a labelled document (`Agreement`, `Annexure`…) gains a row per upload so every signed copy stays recoverable (bytes in the `loom-files` bucket, scope `mou`). Both tables are tenant-scoped with the migration-031 fail-closed RLS policy.

**Leadership directory (042)**: `lead_directory(name, title, user_id nullable → profiles, department_id nullable → departments, vertical, email, linkedin_url, bio, tenure_start, tenure_end, is_current, sort_order, created_by, is_active)` — the chapter's own roster of leads and heads, kept separate from `profiles` so a row can outlive an account (alumni, faculty advisor) and one member can hold several titles over time; `user_id` links a live account when there is one but is never required. Tenant-scoped with the migration-031 fail-closed RLS policy.
