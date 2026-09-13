# Frontend UX and Motion

## App IA

Primary student navigation:

- Dashboard
- Roadmap
- Resources
- GitHub
- Contests
- Mentorship
- Profile

Primary admin navigation:

- Overview
- Students
- Roadmaps
- Resources
- Contests
- Mentorship
- Analytics
- Settings
- Audit

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

The initial app uses:

- Light theme with strong contrast
- Neutral surfaces
- One green accent for progress and action
- 8px radius for product surfaces
- Stable grid dimensions for roadmap and dashboard panels
