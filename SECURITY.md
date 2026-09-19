# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| `main` (Next 15.5.x, Vitest 4.x) | ✅ |
| Older tags / forks | ❌ (upgrade to `main`) |

## Reporting a vulnerability

**Do not open a public issue for security reports.**
Contact a repository maintainer privately with:

- Affected route, file, or dependency and version
- Steps to reproduce (request, role, payload)
- Impact assessment (who can read/write what they should not)

We aim to acknowledge within 72 hours and will coordinate a fix plus
a revert-first response if production is impacted
(`git revert` before forward-fix, per `AGENTS.md`).

## Dependency posture (Sep 2026)

`npm audit` is clean (0 vulnerabilities) after the Option-A upgrade:

- `vitest ^4.1.11` (fixes GHSA-5xrq-8626-4rwp UI RCE and GHSA-82fw-gwwq-j7x9 mocker traversal; pulls `vite 8.3.0`, which fixes GHSA-fx2h-pf6j-xcff, GHSA-4w7w-66w2-5vf9, launch-editor UNC handling, and removes the `esbuild` dev-server surface)
- `next ^15.5.25` + `overrides: { postcss: 8.5.28 }` (top-level and nested `postcss` both at `8.5.28`, fixing GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849, GHSA-fxqj-rqcc-2cmp, GHSA-qx2v-qp2m-jg93)

All flagged advisories were **dev-server / build-tool only** (Vite/Vitest/esbuild
dev servers, PostCSS pipelines over untrusted CSS). They never shipped in
`next build` / `next start` output and LOOM does not run `vitest --ui`,
`vite --host`, `esbuild --serve`, or process attacker CSS. The upgrade removes
even the local dev-machine exposure; the `postcss` override is kept until
upstream Next 15 ships a patched nested copy.

Secrets: `DATABASE_URL` and Supabase keys live only in untracked `.env.local`
(see `.env.example`). Never commit them. A historic DB password was purged from
the tree but remains in git history — rotate it in the Supabase dashboard
(see `HANDOFF.md` §6 A1).
