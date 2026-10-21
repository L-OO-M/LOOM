# Admin Guide

Run your chapter: setup, content, people, programs, trust, system.

## 1. First setup

1. Deploy, open `/setup`, and claim the first admin (`POST /api/admin/claim-first`). The claim creates a **permanent founder seat** and closes the endpoint — later admins are promoted from the Students list. Add a deliberate co-founder only with `node load/seed-founder.js` (see [Governance](23-governance-and-terms.md)).
2. Check `/admin` (Overview) for chapter totals.
3. Publish your chapter card: insert/update `chapter_profiles` for your tenant (slug, public name, mission, links). Public cards appear in Network and on the landing page strip.

## 2. Navigation groups

- **Overview** — totals and recent activity.
- **People** — Students (roster, detail, role changes with a term end date), Mentors (add/remove, availability, sessions).
- **Content** — Roadmaps (publish paths/nodes, set `difficulty_level`), Resources (curate per track), OSS (curate repos — live GitHub metadata is fetched and stored with `metadata_synced_at`; catalogue keys are case-insensitive, so `owner/repo` cannot duplicate; review claimed contributions with Verify/Reject, though merged PRs and submitted reviews auto-verify through the webhook; verification awards badges + achievements + notifies the student), Community (flagged threads/replies → Hide; wiki suggestion queue → Approve/Reject; pin featured threads).
- **Programs** — Projects (review student builds), Contests (create, manage registrations/submissions), Events (schedule with capacity; students register and get door codes; check in by code at the door — attendance auto-issues a printable certificate; attach materials; read feedback averages).
- **Trust** — Proof/Verification (define skill badges tier 1–3, issue achievements to students, audit latest issued, count live share links), Data/Analytics (cohort health, domain distribution, bottleneck nodes by drop-off %, mentor effectiveness, contest registration→submission conversion).
- **System** — Settings (chapter configuration), Flags (feature switches), Audit (every admin action is logged here with before/after).

## 3. Weekly operating loop

1. **Monday**: check Data — active (7d) students, bottleneck node with the worst drop-off; fix its resources or split the node.
2. **During the week**: clear OSS claims, wiki queue, and flags (all three show counts on their consoles).
3. **Events**: create the week's workshop (capacity on), check in at the door, attach slides afterwards.
4. **Recognition**: issue achievements for contest winners; students share them as verifiable links themselves.

## 4. Roles and annual rotation

Only the founder seat is permanent. Every `dept_lead`, `vertical_lead`, and `admin` holds a term (one year by default):

- Appoint on **Students → open a person → Role management**: choose role, scope, and **term end date**.
- A term that has ended **suspends authority immediately** (the person falls back to core). The title stays for history; reappoint or extend to restore it.
- Heads cannot act outside their department; vertical leads cannot cross into the other domain; no lead can appoint accounts — `manage_users` is admin-only.
- `/admin/handover` lists every leadership term ending in the next 45 days and holds the approval queue for guided seat handovers. Read the outgoing lead's brief, then **Approve and transfer** — role, Head/Co-Head slot, planner sessions and open event-ops move in one transaction. You cannot approve your own handover.
- Founders cannot be demoted or edited by any role-change API.

Full model: [Governance & terms](23-governance-and-terms.md).

## 5. Nightly jobs (must be scheduled — see `15-deploy-and-operations.md`)

- `rollup-federation.js` — refreshes chapter stats + federation metrics (powers Network + landing strip).
- `rollup-analytics.js` — per-student snapshots, cohort health, node funnels, mentor effectiveness (powers Insights + Data).
- `expire-terms.js --apply` — weekly: marks ended leadership terms expired, notifies the holder and admins, adds a handover item.

Without these, Insights/Data/Network show the last computed values — never fake live ones.

## 6. Moderation policy defaults

- Flags are community signals, not verdicts: 1 flag surfaces, admin decides.
- Hide removes from student views but keeps the row (audit-safe); unhide via direct DB update if needed.
- Wiki edits by students are suggestions (pending) unless made by an admin (applied directly, version bumped).
- Votes are one-per-student per target with synced counters; rate-limited (60/min).

## 7. Safety rules

- Tenant is derived from the member's profile on the server — admins only ever see their own chapter.
- `platform_admins` bypass tenant checks and founder seats are permanent: grant sparingly, audit always.
- Never edit `auth.users` directly; manage membership through `profiles`.
- Service-role key stays server-side (`.env.local`, never committed, never in client code).
