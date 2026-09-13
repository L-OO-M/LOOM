# Build Phases

## Phase 1: Foundation

Create the Next.js app, documentation spine, visual system, scripts, env validation, API envelope, mock data, tests, and deployment notes.

Exit criteria:

- App boots locally
- Public, student, and admin routes render
- Unit tests pass
- Build succeeds

## Phase 2: Control Plane and Tenant Shell

Add tenant schemas, resolver, feature flags, RBAC, and audit logging.

Exit criteria:

- Local host resolves to the demo tenant
- Student/admin access checks exist
- Admin mutations write audit logs

## Phase 3: Roadmap MVP

Add roadmap display, progress updates, recommendations, and optimistic UI.

Exit criteria:

- Student can complete a node
- Next node activates
- Recommendation list updates

## Phase 4: GitHub Pipeline

Add GitHub App connection placeholders, webhook verification, processor job, aggregates, and reconciliation contract.

Exit criteria:

- Webhook signature verification is tested
- Duplicate delivery IDs are idempotent
- Aggregates update from normalized events

## Phase 5: Admin MVP

Add admin overview, student directory, roadmap/resource management, feature flags, analytics, and audit review.

Exit criteria:

- Admin can inspect student progress
- Admin can modify roadmap/resource records
- Analytics read aggregate tables

## Phase 6: Growth Modules

Add contests, submissions, project reviews, mentorship sessions, notifications, leaderboards, and R2 file metadata.

Exit criteria:

- Each module has feature flags
- Each module has student and admin workflows
- Each module has acceptance tests

## Phase 7: Hardening

Add load tests, security checks, Sentry, cache policy validation, production deployment documentation, and failure drills.

Exit criteria:

- k6 scenarios run
- Playwright covers core paths
- Production checklist is complete
