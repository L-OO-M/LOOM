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

Drizzle mirror: `db/tenant-schema.js` (product tables), `db/control-plane-schema.js` (`tenants`, `tenant_domains`, `tenant_database_routes`, `feature_flags`, `platform_admins`).

## Tables by area

**Identity & tenancy**: `users(id, email, role, tenant_id)`, `profiles(user_id unique, name, role, tenant_id, enrollment_number, department, year, primary_domain, onboarding_completed, github_username, classification)`, `tenants(id, slug unique, name, status)`.

**Learn**: `roadmaps`, `roadmap_nodes(id text PK, roadmap_id, title, description, domain, difficulty_level, sort_order)`, `student_roadmap_progress(student_id, node_id, status, evidence_source, unique(student,node))`, `resources(id text PK, title, domain, level, kind, url, storage_key, minutes)`, `resource_progress(unique(student,resource))`.

**Build**: `projects(owner_id, tenant_id, title, description, roadmap_node_id, status, repo_url, tags[])`, `repositories`, `github_connections(user_id PK, github_username)`, `github_events(idempotency_key unique, event_name, delivery_id, actor_login, payload)`, `student_daily_activity(student_id, day, commits, pull_requests, reviews, score)`, `open_source_projects(github_repo_url unique, owner, repo_name, difficulty, primary_domain, language, stars, good_first_issues, is_curated, tenant nullable = global)`, `student_oss_contributions(unique(student,pr_url), project FK, status claimed|verified|rejected)`, `oss_badges(unique(student,badge_key))`.

**Compete**: `contests`, `contest_registrations(unique(contest,student))`, `contest_submissions`, `leaderboard_snapshots(scope, period, data jsonb)`, `events`, `event_registrations(unique(event,student), check_in_code, feedback)`, `event_materials`, `certificates(verification_code unique)`.

**People**: `mentors(user_id unique, tenant_id, expertise, bio, available)`, `mentor_sessions(mentor_id stores user_id, student_id, status)`, `mentor_reviews(unique(mentor,reviewer), rating 1–5)`, `forum_threads(status visible|hidden, pinned, solved, counters)`, `forum_replies(is_answer)`, `forum_votes(unique(student,type,target))`, `forum_flags(unique(student,type,target))`, `wiki_pages(unique(tenant,slug), version)`, `wiki_edit_requests(status pending|approved|rejected)`, `code_snippets`, `chapter_profiles(tenant unique, slug unique, public_stats jsonb)`, `chapter_partnerships`, `federation_metrics(metric_date unique)`, `user_profiles(user_id unique, username unique)`, `followers`, `user_endorsements`.

**Proof & insight**: `skill_badges(tier 1–3)`, `student_achievements(unique(student,badge,source,ref)` + partial unique for sourcerows)`, `verifiable_credentials(id text PK `cred_*`, signature HMAC, view_count)`, `credential_views`, `student_analytics_snapshots(unique(student,date))`, `cohort_metrics(unique(tenant,date))`, `roadmap_node_analytics(unique(node,tenant))`, `mentor_effectiveness(unique(mentor,tenant))`.

**System**: `notifications`, `audit_logs`, `schema_migrations`.

## Key relationships

- `profiles.tenant_id → tenants.id` is the tenancy root; every tenant query filters on it.
- `student_roadmap_progress.node_id → roadmap_nodes.id` (text keys, stable across tenants).
- `student_oss_contributions.project_id → open_source_projects.id`; webhook matches `owner/repo` + author login → profile/github_connection.
- `mentor_sessions.mentor_id` stores `mentors.user_id` (not the uuid PK) — joins go through `profiles.user_id`.
- `verifiable_credentials.achievement_id → student_achievements.id`; signature = HMAC(id, student, type, issuedAt).
- `certificates(event_id, student_id)` issued once per pair at check-in.
