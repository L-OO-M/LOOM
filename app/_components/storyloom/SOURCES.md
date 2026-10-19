# Homepage integration

Source: `/Users/apple/Desktop/shared-pages-storyloom/src/routes/index.tsx` and its six homepage UI components. Ported to JavaScript/JSX without adding dependencies. Illustrations and sculpture assets are served from `/public/storyloom/`. The original sculpture assets came from the 21st.dev URLs declared in the source component. The stacking-card source credits Hyperiux Vault.

All imported design tokens and utility rules are scoped to `.story-home`; the existing layouts, global stylesheet, authentication handlers, database, and workspace routes are unchanged. Workspace footer destinations come from `lib/nav.js`. Hero and join actions use existing registration/login routes, and signed-in users resolve their dashboard through the existing profile API and `homeForRole` helper. The source's font injection is disabled in favor of LOOM's existing fonts.

## Issues fixed

- Home → join buttons → expected registration/login, source linked back to the same section → wired real `/register` and `/login` routes → homepage auth-navigation E2E.
- Home → footer pillar labels → expected working links, source had missing destinations → wired workspace links from `lib/nav.js`, retained public/legal destinations → homepage link E2E.
- Home → mobile navigation → expected access to public pages, reference hid links on mobile → added an accessible menu with Escape/focus restoration → mobile navigation E2E.
- Home → footer → expanded route list could be clipped by source's fixed height → allow content-driven height with space for the wordmark → both mobile/theme screenshots.
- Home → motion → reduced-motion mode still scrubbed a large horizontal timeline → static activity layout and unstacked cards for reduced motion; carousel autoplay disabled → reduced-motion screenshots and keyboard carousel E2E.
- Home → external assets → reference fonts conflicted with existing CSP and sculpture loading depended on third-party availability → local sculpture/illustration assets and existing fonts → local-image and console-error screenshot checks.
- Home → headings → timeline skipped h3, footer groups had no h2 parent → normalized timeline headings and added an accessible footer heading → homepage render inspection.

Unused components and styles from the previous homepage implementations were removed after confirming they had no remaining importers. Shared public navigation, footer, and page components used by other routes were retained. The homepage tests cover this requested design.
