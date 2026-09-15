# Frontend UX and Motion

## App IA

Student navigation follows five verbs (source: `lib/nav.js`):

- Home (`/student`)
- Learn — Roadmap, Resources
- Build — Projects, GitHub, Open Source
- Prove — Proof (credentials), Challenges (contests), Standings (leaderboard)
- Connect — Mentors, Community (forums/wiki/snippets), Events
- Discover — People, Chapters (network)

Secondary: Inbox (notifications), Settings. Mobile bar: Home, Learn, Build, Connect, Proof.

Admin navigation groups: Overview; People (Students, Mentors, Departments); Content (Roadmaps, Resources, OSS, Community); Programs (Contests, Events, Projects); Trust (Proof, Data, Finance, Reports); System (Settings, Handover, Flags, FAQ, Audit).

Leads (`dept_lead` / `vertical_lead`) get a separate `/lead` console (Console, Roster, Workshops) — not the admin workspace.

## Product Feel

The product should feel calm, useful, and quick. Motion should explain:

- Where the user is
- What changed
- What action matters now
- What progress means

## Motion Vocabulary

- Micro: 120-180ms
- Standard: 220-350ms
- Emphasis: 400-650ms
- Cinematic: 800-1400ms

The authenticated app uses micro, standard, and occasional emphasis motion. Cinematic motion belongs only to public storytelling pages.

## Dashboard Sequence

Load hierarchy:

1. Greeting
2. Overall progress
3. Domain progress
4. Next action
5. Supporting activity

Do not animate every card at once.

## Roadmap Signature

Roadmap completion should show a clear state transition:

- Completed node becomes checked
- Progress line extends
- Overall percentage updates
- Next node activates

## Accessibility

All motion respects `prefers-reduced-motion`. Reduced motion disables long transitions, looping animation, and scroll choreography.

## Visual System

The app ships two themes: dark (near-black `#0a0b0c`, gold `#d6b25e`) and light (warm ivory `#faf6ee`, brass `#8a6d1f`). Display type is Fraunces (`--font-display`); product surfaces use spot-cards, thread tokens, and stable skeleton loaders (`loading.jsx` + `(app)/error.jsx` boundary). Every app `<Link>` carries `prefetch={false}` to keep pooler-backed navigation cheap.
