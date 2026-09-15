# Verification Plan

## Unit Tests

Cover:

- Tenant resolution
- RBAC checks
- Zod schemas
- API envelopes
- GitHub event normalization
- Anti-gaming caps

## Integration Tests

Cover:

- API route authorization
- Tenant isolation
- Roadmap progress writes
- GitHub webhook idempotency + paused-gate behavior
- Audit-log creation

## Browser Tests

Playwright covers:

- Public landing page render
- Student dashboard render
- Roadmap completion path
- Resource filtering
- GitHub connect flow (paused by default; opt-in per chapter)
- Admin overview render
- Admin audit visibility
- Mobile layout sanity

## Accessibility

Check:

- Keyboard navigation
- Focus states
- Text contrast
- Control labels
- Reduced motion behavior

## Load Tests

k6 scenarios target:

- Dashboard
- Roadmap
- Resources
- Leaderboard
- Admin analytics
- GitHub webhook processing

`load/k6-smoke.js` is a single 30s ramp to 100 VUs (landing, `/student`, `/admin`, `/api/health`). Extend it before claiming multi-thousand-user capacity.

## Evidence Rule

A phase is complete only when there is evidence:

- Command output
- Test result
- Browser screenshot or manual notes
- Known limitations
- Follow-up issues when needed
