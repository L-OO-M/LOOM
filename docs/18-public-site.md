# Public Site

Signed-out visitors get real pages backed by real DB rows: FAQ, About, Events, department (domain) pages, plus three landing sections and three public JSON APIs. No mocks anywhere — empty states explain why-empty and what-next.

## Pages

| Route | Source | Notes |
|---|---|---|
| `/faq` | `faqs` (`is_published`, ordered by `sort_order`) | Native `<details>` accordion, no JS |
| `/about` | static vision copy + `departments` leadership | Head/co-head names joined from `profiles`; no faculty-advisor section (no data source — omitted, not invented) |
| `/events` | `events` (`upcoming`/`live`, `starts_at >= now - 2h`) | Read-only; register CTA points to `/login` |
| `/domains/[slug]` | `departments` (active only) + `roadmap_nodes` (by domain slug) + `events` (by `department_id` OR domain) | Join CTA: logged-out sees a `/register` link; logged-in sees a button POSTing `/api/departments/[id]/join` (401 falls back to `/register`) |
| `/` (landing) | new Upcoming events / Project showcase / Department quick-links sections | Client components fetch the public APIs with `.catch(()=>{})` honest fallbacks, same pattern as `LiveStats` |

Pages resolve the tenant from the request host (`resolveTenantFromHost`) with a `demo-college` fallback, and scope every query with `(tenant_id = X OR X IS NULL)`. All data fetches are wrapped so a DB hiccup renders an honest empty state — never a 500.

## APIs

- `GET /api/public/events` — upcoming/live events with department name. No auth.
- `GET /api/public/projects` — recent projects with owner name. No auth.
- `GET /api/public/departments` — active departments with head/co-head names + member counts. No auth.
- `GET /api/admin/faq` — tenant-scoped list (published + drafts). Admin only.
- `POST /api/admin/faq` — `{ slug?, question, answer, sortOrder?, isPublished? }`, upsert on `(tenant_id, slug)`. Admin only, audited.
- `PATCH /api/admin/faq` — `{ id, slug?, question?, answer?, sortOrder?, isPublished? }`. Admin only, audited.

Public routes resolve the tenant from the host (same as `lib/tenant.js resolveTenantFromHost`); admin routes use `getRequestContext({ adminOnly: true })`.

## Middleware

`middleware.js` allowlists the new surface: exact matches for `/about`, `/faq`, `/events`, `/api/public/events`, `/api/public/projects`, `/api/public/departments`, plus a `/domains/*` prefix branch (same style as the existing `/verify/*` branch). Everything else under `/api/*` still 401s without a session.

## Data

- Migration `018_faq.sql` creates `public.faqs` with a `(tenant_id, slug)` idempotency key.
- `node load/seed-faq.js` seeds 5 entries per tenant (membership process, eligibility, domains, mentorship, beginner-friendliness). Idempotent; safe to re-run. Migrations are applied by the coordinator (`node load/migrate.js`), not by this workstream.

## Admin

`/admin/faq` (behind the existing admin layout gate) is a tiny manager: create entries, publish/unpublish toggle. The list is the source of truth for `/faq`.

## Verification

- `npm run lint` — must pass.
- `npx playwright test e2e/public.spec.js` — existing tests untouched and passing; new tests assert 200 + key heading per page and `{ ok: true }` from each public API without auth.
