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

Pages resolve the tenant from the request host (`resolveTenantFromHost`), then from the deployment-configured `DEFAULT_TENANT_SLUG`; there is no hardcoded chapter. Every query is scoped with `(tenant_id = X OR X IS NULL)`. All data fetches are wrapped so a DB hiccup renders an honest empty state — never a 500.

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

## SEO surfaces

- Root app/layout.jsx owns the title template (%s | LOOM), description, keywords, OG defaults (/loom-og.png), and summary_large_image twitter card. It emits the Search Console `google-site-verification` meta tag by default (the live lets-loom.xyz token); `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` only overrides it. `googleBot` sets `max-image-preview: large`, unlimited snippet and video previews.
- Ownership is proven twice: the meta tag above and committed `public/google<token>.html` files (see `15-deploy-and-operations.md`). Both are verified by `e2e/public.spec.js` and `tests/search-console-verification.test.js`.
- Public pages (/about, /faq, /events, /domains, /domains/[slug] via generateMetadata) each set title + description + absolute canonical (lib/seo.js canonicalFor). The landing page is a client component, so it inherits root metadata + sitemap canonical.
- app/sitemap.js (daily revalidate: public routes incl. `/privacy`, `/cookies`, `/terms`, `/disclaimer`, `/contact` + active department slugs from the DB, degrades to static routes when the DB is unreachable).
- app/robots.js is the GEO/AEO contract: a `*` group, explicit groups for search and assistant crawlers (`OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Perplexity-User`, `Claude-SearchBot`, `Claude-User`, `MistralAI-User`, `DuckAssistBot`, `Googlebot`, `Bingbot`, `Applebot`, `DuckDuckBot`), and training-only crawlers allowed by default (`AEO_BLOCK_TRAINING=1` refuses them). It allows public pages + `/verify/` + `/u/` + `/llms.txt` and disallows `/api/` (except the advertised public endpoints), app workspaces, auth and setup.
- Private areas (/student, /admin, /lead layouts, (auth) group, /setup) all emit noindex, nofollow.
- Structured data via components/seo/JsonLd.jsx: Organization + WebSite on /, FAQPage on /faq (DB-driven), ItemList of departments on /domains.
- One <h1> per public page (PageHero owns it; empty-state branches are mutually exclusive); department cards use <h2>. All internal navigation uses <Link prefetch={false}> (pooler-friendly); the only raw <a href> targets are API file downloads, which must not client-navigate.


## Pages added since the original table

| Route | Purpose | Notes |
|-------|---------|-------|
| `/privacy` | Privacy policy | DPDP Act 2023 policy: categories, lawful basis, sharing/processors, cross-border, retention, security/breach, rights, children, grievance officer. Identity, address, contact and retention come from `LEGAL_*` env with real defaults, never brackets. Registration records acceptance of the current version |
| `/cookies` | Cookie policy | Describes only what the deployment actually sets: the Supabase `sb-*` / Auth0 `appSession` session cookie, short-lived OAuth flow cookies, and `loom-theme` / `loom-palette` local storage. States plainly that no analytics, advertising or marketing trackers are used, so there is no consent banner to dismiss |
| `/terms` | Terms and conditions | Full agreement: eligibility, accounts, acceptable use, IP, member content and code, moderation/takedown, fees, warranties, liability, indemnity, termination, privacy, changes, force majeure, general provisions, Indian governing law with Delhi-seated arbitration, and the Grievance Officer table |
| `/disclaimer` | Disclaimer | General information only, no professional advice, external links, affiliate/sponsored content (none published today), no guaranteed outcomes, availability, and liability |
| `/contact` | Contact the chapter | Honest empty state: the chapter has not published a contact address yet |
| `/u/[username]` | Public shareable profile | The only student-facing public profile. A portfolio, not a poster: proof ledger (machine-verified or human-approved only), projects, snapped GitHub activity, LeetCode progress, linked developer accounts, and the downloadable card. Linked accounts carry an ownership state (`verified` / `linked` / `claimed` / `check failed`, migration 083) and only `verified` renders a tick, so a typed handle is never presented as proof. Each profile owns a `generateMetadata` title/description/canonical — without it every profile claimed the homepage as canonical. Its most recent project no longer links into the authenticated project route |
| `/u/[username]/card/[format]` | Downloadable ID card | Raw asset route |
| `/u/[username]/opengraph-image` | Social share image | Generated |
| `/verify/credential/[id]` | Public credential verification | Exists to be reached by people who have **no account**; it must stay unauthenticated |
| `/llms.txt` | AI crawler guidance | Served as a static route, listed in `robots.txt` |
| `/sitemap.xml`, `/robots.txt` | Crawl surfaces | No longer excluded from the middleware matcher: they pass through an early public branch so they keep the nonce-based CSP (see `middleware.js`) |

## Structural note: one `h1`, always

Public pages carry exactly one `<h1>`, enforced by `e2e/public.spec.js`.

Loading boundaries (`loading.jsx`) must **not** emit an `<h1>`. They render while
the page streams in, so an `<h1>` there briefly gives the document two. All four
public loading boundaries pass `headingLevel="h2"` to `PageHero` for this reason.

Security headers are applied to every response — including `sitemap.xml` and
static assets — from `next.config.mjs`, because the middleware matcher excludes
those paths so they are never auth-gated.