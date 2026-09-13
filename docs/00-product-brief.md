# L.O.O.M. Product Brief

## Purpose

L.O.O.M. is a learning operating system for college developer communities. It turns student activity, roadmap progress, GitHub evidence, contests, resources, and mentorship into one clear growth path.

The product serves two primary audiences:

- Students who need a concrete path from current skill to next useful action
- College admins and mentors who need trustworthy visibility into student growth

## Core Promise

Students should always understand:

- Where they are in their learning path
- What changed since their last action
- What they should do next
- Which real technical work supports their profile

Admins should always understand:

- Which students need attention
- Which domains show momentum
- Which roadmaps and resources work
- Which activities deserve review

## Product Surfaces

The public surface introduces the platform and college onboarding.

The student surface includes:

- Dashboard
- Roadmap
- Resources
- GitHub activity
- Contests
- Projects
- Mentorship
- Profile

The admin surface includes:

- College overview
- Student directory
- Roadmap and resource management
- Contest management
- Mentorship operations
- Analytics
- Feature flags
- Audit log

## Non-Goals

The first version does not include:

- AI tutoring
- AI ranking of students
- Raw activity point farming
- Real-time everything
- A heavy custom animation framework
- A promise of permanently free infrastructure at institutional scale

AI can become a later service that reads structured platform data. It is not part of the core architecture.

## Design Principle

The frontend may feel alive. The backend must stay boring.

Motion explains hierarchy, progress, and state changes. The backend favors deterministic jobs, Postgres tables, queues, webhook events, aggregates, and caches.

## Success Criteria

The MVP succeeds when:

- A student can join a demo college, view a roadmap, complete a node, and see recommendations update
- A student can connect or simulate GitHub activity and see aggregate activity appear
- An admin can view student progress, edit roadmap/resource data, and inspect an audit log
- Tenant identity is resolved server-side
- Core flows have tests and documented acceptance evidence
