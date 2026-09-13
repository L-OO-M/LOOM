# System Architecture

## Stack

L.O.O.M. uses:

- Next.js App Router for the web app and server route handlers
- JavaScript and JSX for implementation simplicity
- Tailwind CSS for layout and visual tokens
- Radix primitives for accessible UI foundations
- Lucide React for iconography
- Motion for React for product interaction and state transitions
- GSAP with ScrollTrigger only for public storytelling pages
- PostgreSQL with Drizzle ORM for durable data
- A control-plane database for tenants and platform configuration
- Tenant databases for college-owned learning data
- QStash for background work and retries
- Upstash Redis for rate limits and hot cache
- Cloudflare R2 for large files
- GitHub App webhooks for developer activity

## Runtime Shape

Requests enter Next.js through public pages, authenticated app routes, API route handlers, or background job routes. Auth and tenant resolution run before data access. Tenant learning data is fetched from the tenant database resolved from the control plane.

```text
request
host/domain
tenant resolver
auth and RBAC
tenant database
response
```

## Databases

The control plane stores platform data only:

- Tenants
- Tenant domains
- Tenant database routing
- Feature flags
- Platform admins
- Deployment config

Tenant databases store college data:

- Users and profiles
- Roadmaps and progress
- GitHub activity
- Contests
- Resources
- Mentorship
- Notifications
- Analytics aggregates
- Audit logs

## Background Work

Heavy or repeated work runs asynchronously:

- GitHub webhook processing
- Daily and monthly aggregates
- Classification recalculation
- Leaderboard snapshots
- Email delivery
- Reconciliation jobs

## Animation Boundaries

Motion handles app UI:

- Reveals
- Page transitions
- Roadmap state changes
- Progress rings
- Count updates
- Hover and press feedback

GSAP handles only public scroll storytelling:

- Pinned sections
- Scrubbed timelines
- Large typography sequences

CSS handles simple hover, opacity, transforms, skeletons, and loaders.

## Cost Discipline

The system saves cost by reducing computation:

- Webhooks instead of polling
- Aggregates instead of live recomputation
- Cache for shared data
- Dynamic fetches only for personal data
- Deterministic classification jobs instead of live AI calls
