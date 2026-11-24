/**
 * First-visit page intros.
 *
 * Every private screen explains itself once per member: what the page is for,
 * and the two or three actions that actually move work forward. The copy lives
 * here rather than in 70 components so it can be reviewed as one document, and
 * so a new page fails the coverage test instead of silently getting no intro.
 *
 * Keys are real routes. A key ending in `/*` covers the detail pages under it
 * (`/student/projects/*` is a project, not the list) and must not duplicate the
 * list entry's id: the trailing star becomes `-detail` in the id.
 *
 * Delivery: `components/tour/Onboarding.jsx` resolves the entry for the current
 * pathname, shows it as an in-flow banner (never a modal), and stores "seen"
 * under `tour_state` using the same event path as the spotlight tours. Bump
 * `version` on an entry to show it once more after a meaningful rewrite.
 */
import { normalizePath } from "./routes";

export const PAGE_INTRO_VERSION = 1;

/** Route families that are not literal paths (public handles, unknown slugs). */
const PATTERN_INTROS = [
  {
    key: "/student/:member",
    pattern: /^\/student\/[^/]+$/,
    title: "A member profile",
    body: "This is a public identity card: proof, reputation and the work someone chose to show.",
    points: [
      "Follow or endorse from the card; both need the profile to be visible to your chapter.",
      "Only same-chapter members (or the owner) see a private profile."
    ]
  }
];

export const AREA_INTROS = Object.freeze({
  student: {
    title: "The student workspace",
    body: "Five verbs organise every student screen: Learn, Build, Prove, Connect and Discover.",
    points: [
      "Use the top bar on a laptop or the bottom bar on a phone; both point at the same routes.",
      "The bell shows anything waiting on you, and Settings lets you replay this walkthrough."
    ]
  },
  lead: {
    title: "The lead console",
    body: "Everything you can act on as a department Head or Vertical Lead, scoped to your own people.",
    points: [
      "Sections open from the top bar; each one is its own URL, so refresh and back both work.",
      "Anything outside your scope is absent rather than disabled - the server never sends it."
    ]
  },
  admin: {
    title: "The admin workspace",
    body: "Chapter operations, grouped by what you are changing: people, content, programs, trust and system.",
    points: [
      "Use the top bar to switch group, then pick the exact screen from its menu.",
      "Every write here is recorded in Audit, so act as if the log is public - it is to your successors."
    ]
  }
});

export const PAGE_INTROS = Object.freeze({
  /* ---------------------------------------------------------------- student */
  "/student": {
    title: "Your Home screen",
    body: "The only page that summarises the whole week: next step, rhythm and decisions waiting on you.",
    points: [
      "Work through the Start-here checklist; it disappears when every step is done.",
      "The skill radar compares you with the chapter average, never with a named person."
    ]
  },
  "/student/onboarding": {
    title: "Set your direction",
    body: "Pick the track you want to start on and claim the handle your work will travel under.",
    points: [
      "A track unlocks its roadmap immediately; you can change it later in Settings.",
      "Your username becomes /student/<handle> - choose it once, carefully."
    ]
  },
  "/student/roadmap": {
    title: "The roadmap graph",
    body: "Your path, node by node. Each node carries resources and, where it matters, required evidence.",
    points: [
      "Open a node for its drawer, mark it complete, and move with previous/next.",
      "The challenge panel beside the path opens the same domain's practice work."
    ]
  },
  "/student/roadmap/*": {
    title: "A roadmap node",
    body: "Read the node, open its resources, then close it only when you can point at the evidence.",
    points: [
      "A node that requires evidence will not complete without it.",
      "Completed nodes feed your Insights, your standing and your shareable card."
    ]
  },
  "/student/challenges": {
    title: "Domain challenges",
    body: "Open challenges for the track you are reading, with the domain's own difficulty ladder.",
    points: [
      "Open a challenge to see its brief and what a good submission contains.",
      "Challenges also open from the panel beside the roadmap, carrying your current track."
    ]
  },
  "/student/practice": {
    title: "The weekly practice set",
    body: "Seven problems a week, the same set for the whole chapter, scored on consistency.",
    points: [
      "Solve in your own editor, then submit the link and record the outcome.",
      "The weekly leaderboard rewards showing up, not raw speed."
    ]
  },
  "/student/practice/leaderboard": {
    title: "Practice standings",
    body: "This week's practice board, ordered by the work actually recorded.",
    points: [
      "The board resets weekly; past weeks stay in your Insights.",
      "A missed week costs a streak, not access - the set stays readable."
    ]
  },
  "/student/planner": {
    title: "The collective planner",
    body: "The chapter's shared 28-week calendar: sessions, deadlines and what the whole cohort is doing.",
    points: [
      "Open a session for its agenda and attached material.",
      "Your personal week is summarised on Home, not here."
    ]
  },
  "/student/resources": {
    title: "The resource library",
    body: "Curated material across the tracks, filtered by level and kind so the next hour is not a search.",
    points: [
      "Filter by track, level and type; search matches titles and descriptions.",
      "Marking a resource complete counts as progress on the roadmap."
    ]
  },
  "/student/resources/*": {
    title: "A resource",
    body: "One resource, with the roadmap nodes it supports and a completion control.",
    points: [
      "Mark it complete when you have actually used it.",
      "The shelf attached to a node is the shortest route back to the relevant material."
    ]
  },
  "/student/projects": {
    title: "Projects",
    body: "Ship work in public and keep the proof attached: repository, tags and a readable summary.",
    points: [
      "New project links a repository from your GitHub account or a pasted URL.",
      "Tags and domain make the project discoverable; refresh connected repos to pull new commits."
    ]
  },
  "/student/projects/new": {
    title: "New project",
    body: "Create the project record first; the repository link is what makes it verifiable.",
    points: [
      "Pick a connected repository or paste its URL.",
      "A clear summary is read by leads reviewing your work - write it for them."
    ]
  },
  "/student/projects/*": {
    title: "A project",
    body: "The project's public record: what it does, what it is built with, and the commits behind it.",
    points: [
      "Owners can edit the summary and refresh repository metadata.",
      "Leads review the same page when deciding what to recognise."
    ]
  },
  "/student/work": {
    title: "Department work",
    body: "Tasks assigned to you by a department head, with the link they need to verify your part.",
    points: [
      "Submit a link, not a claim; the head verifies before it counts.",
      "Overdue work is highlighted rather than hidden."
    ]
  },
  "/student/github": {
    title: "GitHub proof",
    body: "Link your username so webhook commits are attributed to you, then grant repository access if needed.",
    points: [
      "Only you can link your username; nobody can claim it for you.",
      "Export JSON downloads the stats this page is showing."
    ]
  },
  "/student/opensource": {
    title: "Open source",
    body: "Curated repositories with real good-first issues, and a claim for the work you are doing.",
    points: [
      "Claim the PR or issue URL before you start so two members do not collide.",
      "Merged PRs and submitted reviews verify automatically and award badges."
    ]
  },
  "/student/debug": {
    title: "Debug bounties",
    body: "Fork a published bug, fix it, and submit the fork for automated and human review.",
    points: [
      "The check confirms the fork is yours and has the commit.",
      "A domain lead reviews the fix before the bounty closes."
    ]
  },
  "/student/debug/*": {
    title: "A debug challenge",
    body: "The brief, the failing behaviour and the submission control for one bounty.",
    points: [
      "Read the reproduction steps before touching the code.",
      "Submission is a fork URL; keep the fix in its own commit."
    ]
  },
  "/student/credentials": {
    title: "Your proof",
    body: "Every credential, badge and event certificate in one ledger, each with its own share control.",
    points: [
      "Create a signed share link per achievement; it works for anyone, without a login.",
      "Links are valid for up to two years and count their views."
    ]
  },
  "/student/certificates/*": {
    title: "An event certificate",
    body: "The printable record of attendance for one event, issued at check-in.",
    points: [
      "Share the page or print it; the certificate is already signed by the chapter.",
      "A missing certificate means the door code was never checked in - ask the event lead."
    ]
  },
  "/student/contests": {
    title: "Contests",
    body: "Time-boxed challenges with registration, a deadline and a submission.",
    points: [
      "Register before the deadline; submissions close with it.",
      "Strong entries can be recognised as signed proof by the chapter."
    ]
  },
  "/student/contests/*": {
    title: "A contest",
    body: "The brief, the clock and your submission for one challenge.",
    points: [
      "Register first - the submit control appears only for registrants.",
      "You can replace your entry until the deadline."
    ]
  },
  "/student/leaderboard": {
    title: "Standings",
    body: "The chapter board, built from verified work rather than logins.",
    points: [
      "Your row is highlighted; open a name to see the public proof behind it.",
      "Scopes let you compare with the college, everywhere, or your circle."
    ]
  },
  "/student/insights": {
    title: "Your insights",
    body: "Your consistency, roadmap progress and where you stand, read back from recorded work.",
    points: [
      "Peer comparison is anonymous and aggregated, never a named ranking.",
      "Snapshots are points in time; the nightly rollup produces them."
    ]
  },
  "/student/roles": {
    title: "Seats",
    body: "Ask for a Core or Head seat in a department, and see what you already hold.",
    points: [
      "A request notifies the department lead; roles are never self-assigned.",
      "Seats carry a term - check the end date before taking one on."
    ]
  },
  "/student/mentorship": {
    title: "Mentorship",
    body: "Request a session with a mentor who opted in, and review it afterwards.",
    points: [
      "Pick a mentor, propose a topic and a time; the mentor confirms.",
      "A short review helps the next student choose well."
    ]
  },
  "/student/help": {
    title: "Help requests",
    body: "Ask the chapter when you are stuck, with enough detail for someone to answer.",
    points: [
      "Say what you tried and what happened; a vague ask gets a vague answer.",
      "Requests stay open until you mark them answered."
    ]
  },
  "/student/community": {
    title: "Community",
    body: "Forums, the chapter wiki and code snippets, in one room.",
    points: [
      "Use the section links to move between forums, wiki and snippets.",
      "Vote useful answers; the author can mark a solution."
    ]
  },
  "/student/community/forums": {
    title: "Forums",
    body: "Threads from the chapter, with votes and marked solutions.",
    points: [
      "Search before posting; the answer may already exist.",
      "Flag spam rather than replying to it - admins moderate."
    ]
  },
  "/student/community/forums/*": {
    title: "A thread",
    body: "One conversation, its replies and the answer the author accepted.",
    points: [
      "Vote the reply that helped; solutions are marked by the thread author.",
      "Reply in the thread rather than starting a duplicate."
    ]
  },
  "/student/community/snippets": {
    title: "Code snippets",
    body: "Short, shared pieces of code with language and context.",
    points: [
      "Include the problem the snippet solves, not just the code.",
      "Copy responsibly: attribution stays on the snippet."
    ]
  },
  "/student/community/wiki": {
    title: "Chapter wiki",
    body: "The chapter's own reference pages, edited by members and applied by admins.",
    points: [
      "Student edits arrive as suggestions and wait for review.",
      "Admin edits apply directly and bump the version."
    ]
  },
  "/student/community/wiki/*": {
    title: "A wiki page",
    body: "One reference page, with its version history and an edit control.",
    points: [
      "Suggest a correction rather than rewriting the whole page.",
      "Check the last edit date before trusting a detail."
    ]
  },
  "/student/sponsors": {
    title: "Sponsors",
    body: "Who backs the chapter, what they support and the agreements behind it.",
    points: [
      "Sponsorship amounts and pipelines are admin finance data, not shown here.",
      "Ask a lead before approaching a listed sponsor."
    ]
  },
  "/student/events": {
    title: "Events",
    body: "Workshops, hackathons and talks, with registration and a door code per event.",
    points: [
      "Register to get the door code; check-in at the door issues a certificate.",
      "Feedback after attending helps the next event; it is not attributed publicly."
    ]
  },
  "/student/events/*": {
    title: "An event",
    body: "The schedule, venue, materials and your registration for one event.",
    points: [
      "Your door code is on this page once you are registered.",
      "Materials are attached after the event by the organiser."
    ]
  },
  "/student/discover": {
    title: "Discover",
    body: "Trending threads, rising builders and mentors worth knowing in your college.",
    points: [
      "Open a card to see the public proof behind a person.",
      "Visibility follows the profile's own setting; private profiles need a chapter match."
    ]
  },
  "/student/network": {
    title: "The federation",
    body: "Chapter profiles and federation totals, refreshed by the nightly rollup.",
    points: [
      "Open a chapter card for its public page and links.",
      "Federation numbers move once a day, not live."
    ]
  },
  "/student/network/*": {
    title: "A chapter",
    body: "One chapter's public profile: mission, links and aggregate activity.",
    points: [
      "Only what the chapter published is shown.",
      "Totals come from the federation rollup, so they lag by a day."
    ]
  },
  "/student/feature-requests": {
    title: "Ideas",
    body: "Suggest and vote on what LOOM builds next; the ledger is shared with admins.",
    points: [
      "Search before posting - duplicates get merged.",
      "Votes are one per member per idea."
    ]
  },
  "/student/notifications": {
    title: "Inbox",
    body: "Every notification, newest first, with the one link it is about.",
    points: [
      "Opening one marks it read and clears the matching nav dot.",
      "The bell in the top bar carries the unread count."
    ]
  },
  "/student/settings": {
    title: "Settings",
    body: "Your profile, handle, theme, privacy controls and the tour replay.",
    points: [
      "Changing track keeps completed roadmap nodes.",
      "Analytics can be switched off here; opted-out accounts write no usage rows.",
      "Replay the workspace walkthrough from the Usage panel at the bottom."
    ]
  },
  "/student/privacy": {
    title: "Privacy",
    body: "What this app stores, what it never stores, and the controls you own.",
    points: [
      "Usage analytics is aggregate and first-party; no third-party scripts run here.",
      "Export or close your account from this page.",
      "Read the policy before changing a data control - some actions cannot be undone."
    ]
  },

  /* ------------------------------------------------------------------- lead */
  "/lead": {
    title: "The lead console",
    body: "The console opens on Overview; every other section is a real route in the top bar.",
    points: [
      "Start with the decisions waiting on you.",
      "Sections are scoped to your department or vertical."
    ]
  },
  "/lead/overview": {
    title: "Your console",
    body: "Roster health, contribution output and the decisions that need a lead.",
    points: [
      "Each card opens the section that owns the number.",
      "Society-wide rows are labelled; everything else is inside your scope."
    ]
  },
  "/lead/departments": {
    title: "Departments",
    body: "The department workspaces you can see, with their roster size and current head.",
    points: [
      "Open a department for its roster and monthly report.",
      "A Head sees their own department; a Vertical Lead sees the whole vertical."
    ]
  },
  "/lead/departments/*": {
    title: "A department",
    body: "One department's roster, work and report, scoped to what your role can edit.",
    points: [
      "Core requests and task assignment live on the roster.",
      "The monthly report is compiled here, then submitted."
    ]
  },
  "/lead/roster": {
    title: "Roster",
    body: "Every member in your scope, their level, and the Core requests you can act on.",
    points: [
      "Approve or decline a Core request from its row.",
      "Open a member for their contributions and current seat."
    ]
  },
  "/lead/members/*": {
    title: "A member",
    body: "One person's seats, contributions and work inside your scope.",
    points: [
      "Only your own scope is shown; another department is absent, not forbidden.",
      "Role changes belong to admins, not this page."
    ]
  },
  "/lead/events": {
    title: "Events",
    body: "Every chapter event you can edit, with its date, capacity and turnout state.",
    points: [
      "Open an event to edit it or read feedback.",
      "Create event schedules a new one with capacity and materials."
    ]
  },
  "/lead/events/new": {
    title: "Create an event",
    body: "Schedule a workshop, hackathon, talk or contest with a real capacity.",
    points: [
      "Capacity drives seat fill and the waitlist on the student side.",
      "Check the planner for clashes before publishing."
    ]
  },
  "/lead/events/*": {
    title: "An event",
    body: "The event's details, door codes, attendance and feedback in one place.",
    points: [
      "Attach slides or recordings after it runs.",
      "Attendance issues certificates automatically at check-in."
    ]
  },
  "/lead/workshops": {
    title: "Workshops",
    body: "Upcoming seat fill and how many people actually showed up last time.",
    points: [
      "A workshop below capacity is worth rescheduling rather than re-advertising.",
      "Turnout comes from check-ins, not registrations."
    ]
  },
  "/lead/event-ops": {
    title: "Event operations",
    body: "Tasks and deadlines for the events you own, across the run-up and the day itself.",
    points: [
      "Overdue tasks are surfaced first.",
      "Completing a task notifies the owner; it does not close the event."
    ]
  },
  "/lead/challenges": {
    title: "Challenges",
    body: "Chapter challenges with their registration and submission counts.",
    points: [
      "Open a challenge to read its brief and manage the deadline.",
      "A low submission rate is a brief problem before it is a student problem."
    ]
  },
  "/lead/practice": {
    title: "Practice room",
    body: "The weekly seven, this week's assignments and any corrections you owe.",
    points: [
      "Assign the week before it starts; students see the same set.",
      "Corrections are reviewed by a lead before they affect the board."
    ]
  },
  "/lead/debug": {
    title: "Debug queue",
    body: "Verified forks waiting for a human review, newest first.",
    points: [
      "The automated check has already confirmed the fork; you judge the fix.",
      "Approving awards the bounty and notifies the student."
    ]
  },
  "/lead/planner": {
    title: "Planner",
    body: "The shared society calendar, where sessions and deadlines are laid out for the cohort.",
    points: [
      "Add a session with its agenda and material.",
      "Students see the same calendar on their Planner page."
    ]
  },
  "/lead/reports": {
    title: "Reports",
    body: "Monthly department reports, the contribution ledger and the export bundle.",
    points: [
      "Compile a draft, read it, then submit; a submitted report is locked unless an admin reopens it.",
      "Export the semester or annual bundle as JSON."
    ]
  },
  "/lead/analytics": {
    title: "Usage",
    body: "Where the chapter actually goes: route traffic, tour drop-off and destinations nobody finds.",
    points: [
      "Every number is an aggregate from the nightly rollup, never a per-member record.",
      "There is no department split: telemetry carries no department attribution.",
      "An empty state means no rollup yet, not zero traffic."
    ]
  },
  "/lead/succession": {
    title: "Succession",
    body: "Who is ready to carry a department forward when a term ends.",
    points: [
      "Read the outgoing brief before proposing a successor.",
      "A handover is approved by an admin, never by the person leaving."
    ]
  },
  "/lead/assets": {
    title: "Assets",
    body: "The shared creative shelf: logos, templates and decks, with versions.",
    points: [
      "Download the current version; old versions stay available.",
      "Uploading a new version keeps the same asset link."
    ]
  },
  "/lead/directory": {
    title: "Directory",
    body: "Leads and heads, current and past, with their departments and terms.",
    points: [
      "An ended term shows history without authority.",
      "Contact details follow each person's own visibility settings."
    ]
  },
  "/lead/mous": {
    title: "MoUs",
    body: "Chapter agreements with their partners, renewal dates and expiry state.",
    points: [
      "Expiring agreements surface in the lead reminders.",
      "Attach the signed document to the agreement, not to a message."
    ]
  },
  "/lead/announcements": {
    title: "Announcements",
    body: "Compose and publish a chapter announcement, or keep it as a draft.",
    points: [
      "A draft is private until published.",
      "Publishing notifies the members the announcement targets."
    ]
  },

  /* ------------------------------------------------------------------ admin */
  "/admin": {
    title: "Chapter overview",
    body: "Chapter totals and recent activity, with the queues that need an admin.",
    points: [
      "Open a queue card to act on it.",
      "Totals are scoped to this chapter; platform-wide views are separate."
    ]
  },
  "/admin/students": {
    title: "Students",
    body: "The roster with role, department and onboarding state.",
    points: [
      "Open a student for contributions, proof and role management.",
      "Role changes need a scope and a term end date."
    ]
  },
  "/admin/students/*": {
    title: "A student",
    body: "One member's record: seats, contributions, proof and role controls.",
    points: [
      "Founder seats cannot be edited from here.",
      "A role change is audited and takes effect immediately."
    ]
  },
  "/admin/mentors": {
    title: "Mentors",
    body: "Who mentors, when they are available and which sessions they have taken.",
    points: [
      "Add a mentor from the roster, then set availability.",
      "Effectiveness comes from completed sessions, not requests."
    ]
  },
  "/admin/departments": {
    title: "Departments",
    body: "Create, rename and archive departments, and see their current heads.",
    points: [
      "Archiving keeps history; it does not delete members.",
      "A department needs a head before it can carry work."
    ]
  },
  "/admin/requests": {
    title: "Seat requests",
    body: "Core and Head requests waiting on a decision.",
    points: [
      "Approve with a scope and term end date, or decline with a reason.",
      "The requester is notified either way."
    ]
  },
  "/admin/roadmaps": {
    title: "Roadmaps",
    body: "Publish paths and nodes, set difficulty and decide what a node requires.",
    points: [
      "A required evidence type blocks completion until it is attached.",
      "Publishing changes what every student on that track sees."
    ]
  },
  "/admin/resources": {
    title: "Resources",
    body: "Curate the library per track, level and kind.",
    points: [
      "Resources attached to a node appear in that node's shelf.",
      "Retiring a resource keeps existing completions intact."
    ]
  },
  "/admin/opensource": {
    title: "Open source console",
    body: "Tracked repositories, their live GitHub metadata and the claims on them.",
    points: [
      "Verify or reject a claimed contribution; merged PRs auto-verify.",
      "Repository metadata is refreshed and stamped with its sync time."
    ]
  },
  "/admin/community": {
    title: "Community moderation",
    body: "Flagged threads, replies and the wiki suggestion queue.",
    points: [
      "Hide removes content from student views but keeps the row for audit.",
      "Approving a wiki suggestion applies it and bumps the version."
    ]
  },
  "/admin/contests": {
    title: "Contests",
    body: "Create and run challenges: registrations, submissions and judging.",
    points: [
      "A contest needs a deadline before it can accept submissions.",
      "Recognising an entry issues proof to the student."
    ]
  },
  "/admin/practice": {
    title: "Practice room",
    body: "The weekly seven, corrections and the practice board's inputs.",
    points: [
      "Publish the week before it starts.",
      "Corrections change what the board counts, so review them before approving."
    ]
  },
  "/admin/debug": {
    title: "Debug and build",
    body: "Author and publish debug challenges, then review verified forks.",
    points: [
      "Publishing stamps the fork-created-after time used by the check.",
      "Review happens per domain; the automated check is not the verdict."
    ]
  },
  "/admin/events": {
    title: "Events console",
    body: "Every chapter event, its capacity, registrations and check-in state.",
    points: [
      "Check in by door code; attendance issues certificates.",
      "Read feedback averages after the event closes."
    ]
  },
  "/admin/events/*": {
    title: "An event",
    body: "One event's schedule, registrations, volunteers and attendance.",
    points: [
      "Door codes and check-in live here on the day.",
      "Attach materials so the event leaves something behind."
    ]
  },
  "/admin/planner": {
    title: "Planner",
    body: "The collective 28-week calendar for the chapter and its sessions.",
    points: [
      "Sessions added here appear on every student's planner.",
      "The planner is a switchable feature; a disabled planner says so instead of hiding."
    ]
  },
  "/admin/projects": {
    title: "Projects",
    body: "Student builds with their repository, tags and review state.",
    points: [
      "Open a project to read its summary and commits.",
      "Recognising a project is a proof decision, not a content edit."
    ]
  },
  "/admin/assets": {
    title: "Creative assets",
    body: "The shared shelf of logos, templates and decks, with version history.",
    points: [
      "Upload a new version instead of replacing the file.",
      "Categories are seeded; keep new uploads inside them."
    ]
  },
  "/admin/mous": {
    title: "MoUs",
    body: "Agreements with partners, their renewal dates and expiry state.",
    points: [
      "Expiring agreements are surfaced before they lapse.",
      "Attach the signed document to the agreement record."
    ]
  },
  "/admin/directory": {
    title: "Leadership directory",
    body: "Every lead and head, current and past, with term dates.",
    points: [
      "An ended term keeps the title for history and removes authority.",
      "Reappoint from the student's record, not here."
    ]
  },
  "/admin/event-ops": {
    title: "Event operations",
    body: "The task board behind every event, with owners and deadlines.",
    points: [
      "Overdue tasks surface first.",
      "Completing a task notifies its owner."
    ]
  },
  "/admin/announcements": {
    title: "Announcements",
    body: "Compose, draft and publish chapter announcements.",
    points: [
      "Drafts stay private until published.",
      "Publishing notifies the targeted members once."
    ]
  },
  "/admin/verification": {
    title: "Verification console",
    body: "Skill badges, achievements awaiting review and the live share links.",
    points: [
      "Define badge tiers before issuing them.",
      "Issuing an achievement notifies the student and becomes shareable."
    ]
  },
  "/admin/ranking": {
    title: "Evidence review",
    body: "Claimed evidence waiting for a human to confirm it.",
    points: [
      "Confirm the claim against the linked artefact, not the summary.",
      "A rejection needs a reason the student can act on."
    ]
  },
  "/admin/analytics": {
    title: "Chapter analytics",
    body: "Cohort health, funnels, mentor effectiveness and where usage actually goes.",
    points: [
      "Every section names its denominator; a percentage without one is a bug.",
      "Usage sections read the nightly rollup, so they lag by a day."
    ]
  },
  "/admin/finance": {
    title: "Finance",
    body: "Budget heads, proposed expenses and the sponsorship pipeline.",
    points: [
      "A Vertical Lead can propose an expense but never approve one.",
      "Approving changes the remaining balance immediately."
    ]
  },
  "/admin/reports": {
    title: "Department reports",
    body: "Submitted monthly reports and the semester/annual export.",
    points: [
      "Only submitted reports are exported.",
      "Reopening a report is an admin action and is audited."
    ]
  },
  "/admin/settings": {
    title: "Settings",
    body: "Chapter identity, public card and the configuration other screens read.",
    points: [
      "The public name and slug drive the chapter's public page.",
      "Changes here are visible to every member immediately."
    ]
  },
  "/admin/handover": {
    title: "Handover",
    body: "Leadership terms ending soon and the queue for guided seat transfers.",
    points: [
      "Read the outgoing brief before approving a transfer.",
      "You cannot approve your own handover."
    ]
  },
  "/admin/flags": {
    title: "Feature flags",
    body: "Chapter-level switches for features that are built but not yet on everywhere.",
    points: [
      "A flag changes what this chapter sees, not the code.",
      "Off is the default: switch something on only when the chapter can support it."
    ]
  },
  "/admin/faq": {
    title: "FAQ",
    body: "The public questions the site answers, and the answers themselves.",
    points: [
      "Answers publish to the public FAQ page.",
      "Unpublish rather than delete when a question stops applying."
    ]
  },
  "/admin/audit": {
    title: "Audit log",
    body: "Every admin action with its before and after, newest first.",
    points: [
      "Filter by actor or area before scrolling.",
      "The log is append-only; it is the chapter's memory."
    ]
  },
  "/admin/feature-requests": {
    title: "Feature requests",
    body: "The idea ledger, with votes and the state each request is in.",
    points: [
      "Merge duplicates so votes land in one place.",
      "A status change is visible to the member who asked."
    ]
  }
});

const SLUG_MAX = 26;

function slugFor(key) {
  const base = key
    .replace(/^\//, "")
    .replace(/\/\*$/, "-detail")
    .split("/")
    .join("-")
    .replace(/[^a-z0-9-]/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return base.slice(0, SLUG_MAX).replace(/-$/, "");
}

function describe(key, entry, path, seen) {
  return {
    id: `intro-${slugFor(key)}`,
    key,
    path,
    version: Number(entry.version) || PAGE_INTRO_VERSION,
    title: entry.title,
    body: entry.body,
    points: entry.points || [],
    seen
  };
}

/**
 * Resolve the intro for a pathname. Exact route, then the longest `*` family,
 * then the member-profile pattern, then the workspace default. Returns null
 * outside the three private workspaces.
 */
export function introForPath(pathname, tourState = null) {
  const path = normalizePath(pathname || "/");
  const seenFor = (entry) => {
    const raw = tourState && typeof tourState === "object" ? tourState[entry.id] : null;
    return Number(raw) >= (Number(entry.version) || PAGE_INTRO_VERSION);
  };

  if (PAGE_INTROS[path]) {
    const entry = describe(path, PAGE_INTROS[path], path, false);
    return { ...entry, seen: seenFor(entry) };
  }

  let best = null;
  for (const [key, value] of Object.entries(PAGE_INTROS)) {
    if (!key.endsWith("/*")) continue;
    const prefix = key.slice(0, -1);
    if (!path.startsWith(prefix) || path.length <= prefix.length) continue;
    if (!best || key.length > best.key.length) best = { key, value };
  }
  if (best) {
    const entry = describe(best.key, best.value, path, false);
    return { ...entry, seen: seenFor(entry) };
  }

  for (const rule of PATTERN_INTROS) {
    if (!rule.pattern.test(path)) continue;
    const entry = describe(rule.key, rule, path, false);
    return { ...entry, seen: seenFor(entry) };
  }

  const area = path.split("/")[1];
  const fallback = AREA_INTROS[area];
  if (!fallback) return null;
  const entry = describe(`/${area}`, fallback, path, false);
  return { ...entry, seen: seenFor(entry) };
}

/** localStorage mirror key; the profile's tour_state is the cross-device copy. */
export function introStorageKey(userId, intro) {
  return `loom-intro:${userId || "anon"}:${intro.id}:${intro.version}`;
}
