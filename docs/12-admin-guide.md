# Admin Guide

Run your chapter: setup, content, people, programs, trust, system.

## 1. First setup

1. Deploy, open `/setup`, and claim the first admin (`POST /api/admin/claim-first`). This closes after the first claim — later admins are promoted from the Students list.
2. Check `/admin` (Overview) for chapter totals.
3. Publish your chapter card: insert/update `chapter_profiles` for your tenant (slug, public name, mission, links). Public cards appear in Network and on the landing page strip.

## 2. Navigation groups

- **Overview** — totals and recent activity.
- **People** — Students (roster, detail, role changes), Mentors (add/remove, availability, sessions).
- **Content** — Roadmaps (publish paths/nodes, set `difficulty_level`), Resources (curate per track), OSS (curate repos — live GitHub stars fetched automatically; review claimed contributions: Verify/Reject; verification awards badges + achievements + notifies the student), Community (flagged threads/replies → Hide; wiki suggestion queue → Approve/Reject; pin featured threads).
- **Programs** — Projects (review student builds), Contests (create, manage registrations/submissions), Events (schedule with capacity; students register and get door codes; check in by code at the door — attendance auto-issues a printable certificate; attach materials; read feedback averages).
- **Trust** — Proof/Verification (define skill badges tier 1–3, issue achievements to students, audit latest issued, count live share links), Data/Analytics (cohort health, domain distribution, bottleneck nodes by drop-off %, mentor effectiveness, contest registration→submission conversion).
- **System** — Settings (chapter configuration), Flags (feature switches), Audit (every admin action is logged here with before/after).

## 3. Weekly operating loop

1. **Monday**: check Data — active (7d) students, bottleneck node with the worst drop-off; fix its resources or split the node.
2. **During the week**: clear OSS claims, wiki queue, and flags (all three show counts on their consoles).
3. **Events**: create the week's workshop (capacity on), check in at the door, attach slides afterwards.
4. **Recognition**: issue achievements for contest winners; students share them as verifiable links themselves.

## 4. Nightly jobs (must be scheduled — see `15-deploy-and-operations.md`)

- `rollup-federation.js` — refreshes chapter stats + federation metrics (powers Network + landing strip).
- `rollup-analytics.js` — per-student snapshots, cohort health, node funnels, mentor effectiveness (powers Insights + Data).

Without these, Insights/Data/Network show the last computed values — never fake live ones.

## 5. Moderation policy defaults

- Flags are community signals, not verdicts: 1 flag surfaces, admin decides.
- Hide removes from student views but keeps the row (audit-safe); unhide via direct DB update if needed.
- Wiki edits by students are suggestions (pending) unless made by an admin (applied directly, version bumped).
- Votes are one-per-student per target with synced counters; rate-limited (60/min).

## 6. Safety rules

- Tenant is derived from the member's profile on the server — admins only ever see their own chapter.
- `platform_admins` bypass tenant checks: grant sparingly, audit always.
- Never edit `auth.users` directly; manage membership through `profiles`.
- Service-role key stays server-side (`.env.local`, never committed, never in client code).
