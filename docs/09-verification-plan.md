# Verification Plan

## Unit Tests

Cover:

- Tenant resolution
- RBAC checks
- Zod schemas
- API envelopes
- Classification logic
- Recommendation rules
- GitHub event normalization
- Anti-gaming caps

## Integration Tests

Cover:

- API route authorization
- Tenant isolation
- Roadmap progress writes
- GitHub webhook idempotency
- QStash job processing
- Audit-log creation

## Browser Tests

Playwright covers:

- Public landing page render
- Student dashboard render
- Roadmap completion path
- Resource filtering
- GitHub connection placeholder
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

Run at 100, 500, 1000, 2000, and 3000 concurrent-user simulation steps with realistic route mixes.

## Evidence Rule

A phase is complete only when there is evidence:

- Command output
- Test result
- Browser screenshot or manual notes
- Known limitations
- Follow-up issues when needed
