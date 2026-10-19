# Governance, Founder Permanence, and Annual Rotation

This document is the authoritative description of **who may act, for how long, and in what domain**. It complements the permission matrix in `lib/permissions.js` (27 actions) and the tenant rules in `AGENTS.md`.

## 1. The model

| Layer | Rule |
|---|---|
| **Founder** | A `platform_admins` row with `is_founder = true` and `locked = true`. Permanent. Founder seats cannot be created through the UI and cannot be demoted or renamed by any role-change API. |
| **Rotating leadership** | `dept_lead`, `vertical_lead`, and `admin` hold a term (`roles.role_term_end`, default one academic year). After the end date the title stays for history, but authority falls back to `core` until an admin reappoints or extends. |
| **Chapter admins** | `profiles.role = 'admin'`. Chapter-wide, but still term-bound unless the account is also a founder. |
| **Vertical leads** | Own exactly one vertical (`technical` or `non_technical`). Every scoped action must carry that vertical; cross-domain records are invisible and immutable. |
| **Department heads** | Own the department(s) where their membership level is `dept_lead`. They may not act in another department or another vertical. |
| **Core / students** | No leadership authority. Core retains read-only access to lead tools and may log their own contributions. |

Roles are **upward-only** and **never self-selected**. `manage_users` is admin-only: a vertical lead can run their domain's operations but cannot appoint, demote, or edit accounts.

## 2. Terms

- `profiles.role_term_start` / `role_term_end` record the **global role** term.
- `department_memberships.term_start` / `term_end` record the **department position** term, so a head's authority can expire without deleting their membership history.
- `leadership_terms` is the append-only appointment history: who held what, when, in which vertical/department, appointed by whom, and why it ended.
- `NULL` end date means **grandfathered**: existing leaders keep their authority until they are reappointed through the admin API. New appointments always receive a term.
- Expiry is enforced at request time by `effectiveRole()` in `lib/permissions.js`. The role-change API writes `role_term_end`; no background job is required for safety.

### Appointing someone

Admin → Students → open a person → Role management. Choose the role, the scope (department or vertical), and the term end date (defaults to one year). The API:

1. refuses to touch a founder seat, yourself, or the last admin;
2. closes the previous active `leadership_terms` row;
3. writes the new role/scope and term;
4. opens a new `leadership_terms` row;
5. downgrades stale `dept_lead` memberships and frees head slots;
6. notifies the person and writes the audit entry.

## 3. Domain non-interference

`lib/scope.js` is the single source of truth:

- `ownedVerticals(profile)` → `{ all: true }` for admins, one vertical for a vertical lead, or the verticals of the departments a head leads.
- `canAccessVertical(profile, vertical)` → a **society-wide record (`vertical = null`) is admin-only**; a lead needs the record's vertical in their owned set.
- `canManageSocietyWide(profile)` → admin-only.

Applied to:

| Surface | Scope rule |
|---|---|
| Departments, roadmaps, department workshops | Department membership (heads) or owned vertical (VL). |
| Society events | VL may publish; heads queue for approval. |
| Department events / approvals | Event's department vertical must be owned; heads limited to their department. |
| Announcements | Department posts need the department; vertical posts need the vertical. |
| Reports | List, read, write, export filtered to owned vertical/department; export is VL/admin. |
| Contributions | Logging for another member needs the department and its vertical. |
| Finance | Budget heads, expenses, sponsorships filtered by owned vertical. |
| MoUs and documents | Record vertical must be owned; society-wide MoUs are admin-only to create/edit. |
| Leadership directory | Entry vertical must be owned; entries follow their department's vertical. |
| Event operations | Tasks follow their event's vertical; society-wide tasks are admin-only; own tasks stay visible. |
| Asset library | **Chapter-wide by design** — shared references, no domain ownership. |

## 4. Expiry job

```bash
node load/expire-terms.js          # dry run
node load/expire-terms.js --apply  # mark expired, notify holder + admins, add handover item
```

Run it weekly (or at the end of each academic year). It is idempotent: `leadership_terms` rows move from `active` to `expired`, notifications are written once per term, and the handover checklist item is deduplicated by title.

`/admin/handover` also shows every leadership term ending in the next 45 days, with the holder and role, so rotation is visible before it happens.

## 5. Seeding founders

The first claim (`POST /api/admin/claim-first`) creates a founder seat and closes the endpoint. To add a co-founder deliberately:

```bash
node load/seed-founder.js --user-id <profiles.user_id> --label "Co-founder"
# or
node load/seed-founder.js --email founder@example.com --label "Co-founder"
```

The account must have signed in once (a `profiles` row must exist). The script is idempotent, promotes the account to `admin`, clears its term, and writes `admin.seed_founder` to the audit log.

## 6. Migration and rollout

- Migration: `load/migrations/048_governance_terms.sql` (additive, idempotent).
- Current leaders are grandfathered (`role_term_end = NULL`). Nothing is demoted by deploying this change.
- Reappoint each leader through the admin UI to start their first term.
- Founder seats are `locked`; role-change APIs refuse them even if the caller is another admin.

## 7. Invariants to preserve

1. Tenant comes from the server context, never from input.
2. A scoped action must carry its vertical; a missing scope is a denial, not a wildcard.
3. Expired authority is a denial at request time — never a UI-only hint.
4. Founder rows are never deleted or demoted by application code.
5. `leadership_terms` is append-only; close a term, never rewrite history.
6. `ACTIONS` stays at 27; scoping changes behaviour, not the matrix size.
