# Area: what changed

## Objective

<!-- One concern only; link issue -->

## Files changed

-

## Gates (paste outputs, all in this session)

- [ ] `npm run lint` — 0 errors (2 pre-existing warnings max)
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npx playwright test` (full suite)

## Manual spot-checks (UI changes)

- [ ] Desktop + mobile (390px), dark + light theme
- [ ] Loading → success/error states, honest empty states

## Checklist

- [ ] `git status` clean of strays; no `.env.local`, `*.log`, screenshots staged
- [ ] Tenant isolation + `can()` check on every mutation (if applicable)
- [ ] Migration file added + docs `13/14/17` updated (if schema changed)
- [ ] No secrets in code, docs, or logs
