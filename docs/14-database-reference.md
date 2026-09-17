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
| 021 | `021_mentor_booking.sql` | mentor profile fields (headline/skills/experience/languages/timezone/rates/verified), `mentor_availability`, `mentor_sessions` booking columns (topic/message/duration/price/meeting_url), `mentor_reviews.session_id`, `mentor_messages` |
| 022 | `022_page_views.sql` | `page_views(tenant_id, visitor_key, user_id, path, referrer)` — first-party visits feeding the analytics dashboard |
| 023 | `023_mentor_sessions_created_at.sql` | ensures `mentor_sessions.created_at` (table predates tracked migrations; analytics summary orders/filters on it) |

Tracked migrations are the single source of truth for schema — there is no ORM mirror. All server queries are parameterized `postgres` template strings via `getSql()` in `lib/db.js` (`{max:10,idle_timeout:10,prepare:false}` for the PgBouncer pooler); tenant config is memoized 60s in `queryTenant()`.

## Tables by area

**Identity & tenancy**: `profiles(user_id unique, name, role, tenant_id, enrollment_number, department, year, primary_domain, onboarding_completed, github_username, classification)` — the single source of truth (the legacy `users` mirror was dropped in migration 012), `tenants(id, slug unique, name, status)`.

**Learn**: `roadmap_nodes(id text PK, title, description, domain, difficulty_level, sort_order)` — no `roadmaps` table; domain is the catalog key (dropped in 012), `student_roadmap_progress(student_id, node_id, status, evidence_source, unique(student,node))`, `resources(id text PK, title, domain, level, kind, url, storage_key, minutes)`, `resource_progress(unique(student,resource))`.

**Build**: `projects(owner_id, tenant_id, title, description, roadmap_node_id, status, repo_url, tags[])`, `repositories`, `github_connections(user_id PK, github_username)`, `github_events(idempotency_key unique, event_name, delivery_id, actor_login, payload)`, `student_daily_activity(student_id, day, commits, pull_requests, reviews, score)`, `open_source_projects(github_repo_url unique, owner, repo_name, difficulty, primary_domain, language, stars, good_first_issues, is_curated, tenant nullable = global)`, `student_oss_contributions(unique(student,pr_url), project FK, status claimed|verified|rejected)`, `oss_badges(unique(student,badge_key))`.

**Compete**: `contests`, `contest_registrations(unique(contest,student))`, `contest_submissions`, `events`, `event_registrations(unique(event,student), check_in_code, feedback)`, `event_materials`, `certificates(verification_code unique)`. Leaderboard computes live (the `leaderboard_snapshots` table was dropped in 012 — never used).

**People**: `mentors(user_id unique, tenant_id, expertise, bio, available, +021: headline, skills, experience_years, languages, timezone, hourly_rate, currency, session_minutes, is_verified)`, `mentor_applications(unique pending per student, eligibility jsonb snapshot, status pending|approved|rejected)`, `mentor_sessions(mentor_id stores user_id, student_id, status, +021: topic, message, duration_minutes, price, meeting_url)`, `mentor_reviews(unique(mentor,reviewer), rating 1–5, +021: session_id)`, `mentor_availability(021: mentor_id stores user_id, day_of_week 0–6, start/end HH:MM)`, `mentor_messages(021: sender/receiver, body, read_at)`, `forum_threads(status visible|hidden, pinned, solved, counters)`, `forum_replies(is_answer)`, `forum_votes(unique(student,type,target))`, `forum_flags(unique(student,type,target))`, `wiki_pages(unique(tenant,slug), version)`, `wiki_edit_requests(status pending|approved|rejected)`, `code_snippets`, `chapter_profiles(tenant unique, slug unique, public_stats jsonb)`, `chapter_partnerships`, `federation_metrics(metric_date unique)`, `user_profiles(user_id unique, username unique)`, `followers`, `user_endorsements`.

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
