# Operations — Volunteering, Reports, Handover, Finance

Migration `019_operations.sql`. All tables are tenant-scoped (`tenant_id`
nullable, queries use `tenant_id = X OR X IS NULL`), `IF NOT EXISTS`,
`public.` schema, CHECK constraints, indexes.

## Tables

| Table | Purpose |
|-------|---------|
| `volunteer_slots` | Titled seats with `capacity` on an `event_id` (CASCADE). `capacity > 0`. |
| `volunteer_signups` | One row per member per slot; `UNIQUE(slot_id, user_id)`. |
| `dept_reports` | One row per `(department_id, month)`; `draft jsonb`, `status draft\|submitted`. |
| `handover_checklists` | Admin continuity items: `title, category, detail, done`. |
| `budget_heads` | `name, allocated >= 0`, optional `vertical` (NULL = society-wide). |
| `expenses` | `head_id`/`department_id` nullable, `amount > 0`, `status proposed\|approved\|rejected`. |
| `sponsorships` | `name, amount >= 0`, `status pipeline\|committed\|received`. |

## API

| Method | Route | Who |
|--------|-------|-----|
| GET | `/api/volunteers?eventId=` | any member; includes `signup_count`, `seats_left`, `signed_up` |
| POST | `/api/volunteers` `{eventId,title,capacity}` | event's dept lead, VL, admin |
| POST / DELETE | `/api/volunteers/[id]/signup` | any member; 409 `EVENT_FULL` when full; re-signup idempotent |
| GET | `/api/reports?status=&departmentId=` | own departments (leads), all (VL/admin) |
| POST | `/api/reports` `{departmentId, month}` | dept lead / VL / admin; auto-compiles draft, upserts on `(department,month)` |
| GET / PATCH | `/api/reports/[id]` | read: own dept + VL/admin; submit `draft→submitted` by dept lead; reopen admin-only |
| GET | `/api/reports/export?scope=semester\|annual` | VL + admin (`export_reports`); JSON download of submitted reports + counts |
| GET / POST | `/api/handover` | admin only (`isAdmin`) |
| PATCH | `/api/handover/[id]` `{done,detail}` | admin only |
| GET | `/api/finance` | admin full; VL own-vertical + society rows; others 403 |
| POST | `/api/finance/expenses` | dept_lead / VL / admin propose |
| PATCH | `/api/finance/expenses` `{id,decision}` | admin only — VL is `recommend_only` |
| POST / PUT | `/api/finance/sponsorships` | admin only |

Every mutation calls `writeAudit`. Errors use the `{ ok, fail, validationError }` envelope.

## Report draft shape

```json
{
  "month": "2026-09-01",
  "compiled_at": "...",
  "contributions_by_kind": { "project": 4, "event": 2 },
  "contributions_total": 6,
  "events_held": 1,
  "events_held_titles": ["Intro to Git"],
  "new_members": 3,
  "workshops_upcoming": 2,
  "workshops_upcoming_titles": ["Docker basics"]
}
```

Counts come from `member_contributions` (by kind, dept + month), `events`
(`past` in-month = held; `upcoming`/`live` = workshops), and
`department_memberships` (`joined_at` in-month).

## UI

- `/lead` — Monthly Report card (`ReportCard` in `components/lead/LeadActions.jsx`):
  department + month pickers, draft preview, recompile + submit.
- Student departments section (`components/student/OrgPanels.jsx`) — volunteer
  slots for the member's own departments with sign-up / cancel.
- `/admin/finance` — heads table with spent/remaining, pending expenses with
  approve/reject (server actions), propose-expense form, sponsorship pipeline
  + add form. Honest empty states throughout.
- `/admin/reports` — submitted list + semester/annual export links hitting the
  export API (JSON download via session cookie).

## Permissions notes

- `approve_budget`: VL gets `recommend_only` — they can propose expenses but
  never decide; `PATCH /expenses` and the finance snapshot's `can_decide`
  flag enforce this.
- `view_finance`: VL scoped to `{ vertical }` — own vertical's departments
  plus society (`vertical IS NULL`) rows.
- `export_reports`: VL + admin.
- `suspend_member` untouched.
