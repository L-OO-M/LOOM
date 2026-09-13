# Data Model

## Control Plane

The control plane contains no student learning records.

Core entities:

- `tenants`
- `tenant_domains`
- `tenant_database_routes`
- `platform_admins`
- `feature_flags`
- `deployment_config`

## Tenant Database

Each college tenant owns a separate database or logical database route.

Core entities:

- `users`
- `profiles`
- `roles`
- `departments`
- `domains`
- `roadmaps`
- `roadmap_nodes`
- `roadmap_resources`
- `student_roadmap_progress`
- `repositories`
- `repository_languages`
- `commits`
- `pull_requests`
- `reviews`
- `issues`
- `github_events`
- `student_daily_activity`
- `student_monthly_stats`
- `repository_stats`
- `domain_activity`
- `contests`
- `contest_problems`
- `contest_submissions`
- `contest_results`
- `projects`
- `project_members`
- `project_reviews`
- `resources`
- `resource_tags`
- `mentors`
- `mentor_assignments`
- `mentor_sessions`
- `badges`
- `student_badges`
- `streaks`
- `leaderboard_snapshots`
- `events`
- `event_registrations`
- `attendance`
- `notifications`
- `activity_events`
- `audit_logs`

## Data Rules

Raw GitHub events are not the primary analytics surface. The UI reads aggregate tables for daily activity, monthly stats, repository stats, domain activity, classifications, and leaderboards.

Progress writes should be narrow:

- Student ID
- Roadmap node ID
- Status
- Completion timestamp
- Evidence source when available

## Classification Storage

Classification output is stored on the profile and versioned:

- Primary domain
- Confidence
- Activity level
- Learning stage
- Cohort
- Classification version
- Classification timestamp
- Classification inputs
- Classification result

## File Storage

Postgres stores metadata. R2 stores large files such as avatars, resource PDFs, project screenshots, certificates, exports, and contest assets.
