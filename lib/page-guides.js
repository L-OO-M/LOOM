/**
 * Per-page walkthroughs.
 *
 * Each private screen gets a short guided tour over its own sections: the page
 * header first, then each real region or control in reading order, each with a
 * sentence on what it is and how to work in it. Nothing floats at the top of the
 * page and nothing is permanently on screen.
 *
 * `at` is the visible text of the thing to spotlight - a section heading, a
 * button label, a link. `components/tour/PageTour.jsx` resolves it inside
 * `#main` at runtime and skips a step whose text is not on the page (a
 * feature-off page, an empty state, a mobile-only control). That is why an entry
 * can list the planner's controls even when the planner is switched off.
 *
 * `tests/page-guides.test.js` walks `app/(app)` and fails when a page has no
 * entry, when an entry loses its sections, and when an `at` string no longer
 * exists in `app/` or `components/` - so renaming a heading fails the suite
 * instead of silently dropping a step from the tour.
 */
import { normalizePath } from "./routes";

export const PAGE_GUIDE_VERSION = 3;

const PATTERN_GUIDES = [
  {
    key: "/student/:member",
    pattern: /^\/student\/[^/]+$/,
    title: "A member profile",
    body: "Someone's public identity card: their proof, their reputation and the work they chose to show.",
    sections: [
      { at: "Chapter record", say: "The scoped view a lead sees. It is not the same page you are on, and it is not public." },
      { at: "Endorse a skill", say: "Adds your endorsement to a skill you have actually seen them use. One per skill." },
      { at: "Share", say: "Copies or opens the card's link so it can be passed on without a login." }
    ]
  }
];

export const PAGE_GUIDES = Object.freeze({
  /* ---------------------------------------------------------------- student */
  "/student": {
    title: "Your dashboard",
    body: "The week at a glance: the path you are on, what you actually proved, and what is coming up.",
    sections: [
      { at: "Your journey", say: "The track you are walking, the node you are on, and how far it has come. Open the path to keep moving." },
      { at: "Recent proof", say: "What you shipped, newest first. If work is missing here, it was never recorded - open the row and check." },
      { at: "Coming up", say: "Events you registered for and deadlines ahead. Browsing an event does not put it here; registering does." },
      { at: "Your tracks", say: "The tracks you are reading. Switching track keeps the nodes you already completed." }
    ]
  },
  "/student/onboarding": {
    title: "Set your direction",
    body: "The first-run screen: pick a track, claim a handle, and connect the account your work is proven from.",
    sections: [
      { at: "Pick your track", say: "Choose the track you want to start on. It unlocks that roadmap immediately, and you can change it later." },
      { at: "Your public handle", say: "This becomes /student/<handle> and is used on every share link, so choose it once and carefully." },
      { at: "Connect GitHub", say: "Link the account your commits come from. Without it, merged work cannot be attributed to you." },
      { at: "What happens next", say: "The short list of what this form unlocks: track, first node, handle and proof attribution." }
    ]
  },
  "/student/roadmap": {
    title: "The roadmap graph",
    body: "Your track drawn as a path: what is done, what is next, and what each node needs before it closes.",
    sections: [
      { at: "Learn / your track, one domain at a time", say: "The masthead names the track you are reading. The map below is that track's path, node by node." },
      { at: "Up next", say: "Your next node. Open it, read the outcomes, then complete it - a node that requires evidence will not close without it." },
      { at: "Prove this track.", say: "The side panel turns the same domain into challenges, open source and debug work, so practice sits next to theory." },
      { at: "Browse the library", say: "Opens the resource library filtered to this track when a node needs more reading than it links." }
    ]
  },
  "/student/roadmap/*": {
    title: "A roadmap node",
    body: "One step of the path: what to learn, the material attached, and the evidence that closes it.",
    sections: [
      { at: "Study this", say: "Opens the resource shelf attached to this node. Work through it before marking anything complete." },
      { at: "Roadmap context", say: "Where this node sits on the path and what comes before and after it, so you can see why it exists." },
      { at: "Back to path", say: "Returns to the graph with your position kept, instead of scrolling from the start." }
    ]
  },
  "/student/challenges": {
    title: "Domain challenges",
    body: "Open challenges for the track you are reading, and the proof route each one leads to.",
    sections: [
      { at: "Challenges for this track.", say: "Every open challenge for your domain, each with the kind of proof it produces." },
      { at: "Society open-source challenge", say: "The chapter-wide OSS challenge. Fork, fix, then claim the pull request so nobody duplicates the work." },
      { at: "Weekly core set", say: "This week's practice problems. Solving them here counts toward the weekly board." }
    ]
  },
  "/student/practice": {
    title: "The weekly practice set",
    body: "Seven problems a week, the same set for the whole chapter, scored on consistency.",
    sections: [
      { at: "This week's practice", say: "The problems for this week. Log the attempt, then mark solved only once the judge accepted it." },
      { at: "Solved vs attempted", say: "How much of what you started you finished. Attempts without solves are the number worth watching." },
      { at: "Progress over time", say: "Your consistency across weeks. A missed week breaks the streak, not your access to the set." }
    ]
  },
  "/student/practice/leaderboard": {
    title: "Practice standings",
    body: "This week's practice board, ordered by the work actually recorded.",
    sections: [
      { at: "This week", say: "The current week's board. Equal scores share a rank; nothing is broken by speed." },
      { at: "This month", say: "The month view, using the same scoring rule as the week." },
      { at: "The rules", say: "Only the assigned questions count, which is why an unsolved extra problem does not help." }
    ]
  },
  "/student/planner": {
    title: "The collective planner",
    body: "The chapter's shared 28-week calendar: sessions, deadlines and what the whole cohort is doing.",
    sections: [
      { at: "Jump to week", say: "Moves the calendar to a specific week of the term instead of scrolling through it." },
      { at: "Filter by wing", say: "Narrows the calendar to one wing, so a talk does not look like a deadline." },
      { at: "Export .ics", say: "Downloads the calendar into your own calendar app." },
      { at: "Back to your dashboard", say: "Shown when the planner is not switched on yet; it returns you to Home." }
    ]
  },
  "/student/resources": {
    title: "The resource library",
    body: "Curated material across the tracks, filtered by level and kind so the next hour is not a search.",
    sections: [
      { at: "Search & filter", say: "Filter by track, level and kind, then search by title or description. Filters stack." },
      { at: "Browse by track", say: "Groups the shelf by track when you know the domain but not the resource." },
      { at: "Open resource", say: "Opens one resource in a new tab. Use it, then record it so it counts as progress." }
    ]
  },
  "/student/resources/*": {
    title: "A resource",
    body: "One resource, the roadmap nodes it supports, and a completion control.",
    sections: [
      { at: "Open & record", say: "Opens the resource and marks it complete in one action - that is what feeds the roadmap." },
      { at: "Return to your path", say: "Goes back to the roadmap node you were reading when you opened this." },
      { at: "Reading compounds.", say: "The note above the resource explains how it is meant to be used, not just what it is." }
    ]
  },
  "/student/projects": {
    title: "Projects",
    body: "Ship work in public and keep the proof attached: repository, tags and a readable summary.",
    sections: [
      { at: "Proof beats progress.", say: "The rule for this page: a project is judged by what it does and what the repository shows, not by the plan." },
      { at: "Start a project", say: "Opens the new-project form, where the repository link is what makes the work verifiable." },
      { at: "Milestones", say: "The checkpoints a project passes through, from active to shipped." },
      { at: "Search", say: "Filters your projects by name, tag or repository, so a full list stays usable." }
    ]
  },
  "/student/projects/new": {
    title: "New project",
    body: "Create the project record first; the repository link is what makes it verifiable later.",
    sections: [
      { at: "Repository", say: "Pick a connected repository, or paste a URL if it is not in the list. This is the verifiable half." },
      { at: "My GitHub repos", say: "Lists repositories from your linked account, newest activity first." },
      { at: "Paste a URL", say: "Switches to manual entry for a repository the account cannot see." }
    ]
  },
  "/student/projects/*": {
    title: "A project",
    body: "The project's public record: what it does, what it is built with, and the commits behind it.",
    sections: [
      { at: "The problem", say: "What the project is actually for. A lead reads this first when deciding whether to recognise it." },
      { at: "The solution", say: "How you solved it, in plain language. This is the part that survives the repository going quiet." },
      { at: "Architecture", say: "The shape of the build: services, data and the trade-offs you accepted." },
      { at: "Edit project details", say: "Owner-only. Updates the summary, tags and lifecycle; leads read the same page when reviewing." }
    ]
  },
  "/student/work": {
    title: "Department work",
    body: "Tasks a department head assigned to you, with the link they need to verify your part.",
    sections: [
      { at: "Your work", say: "The tasks assigned to you, with their deadline. Overdue work is highlighted rather than hidden." },
      { at: "Event operations", say: "The shared task board for events you are working, not just your own rows." },
      { at: "Open the event", say: "Opens the event a task belongs to, so you can check the venue and time." }
    ]
  },
  "/student/github": {
    title: "GitHub proof",
    body: "Link your username so webhook commits are attributed to you, then grant repository access if needed.",
    sections: [
      { at: "Connected account", say: "The account currently linked. Only you can link it; nobody can claim your username for you." },
      { at: "Your building activity", say: "The contribution heatmap, merged per day from webhooks and the calendar sync." },
      { at: "Verified contribution", say: "What actually counted: merged pull requests and verified commits, not local branches." },
      { at: "Add repositories", say: "Grants access to more repositories so their commits can be attributed." }
    ]
  },
  "/student/opensource": {
    title: "Open source",
    body: "Curated repositories with real good-first issues, and a claim for the work you are doing.",
    sections: [
      { at: "The contribution loop", say: "The loop this page is built around. The claim is what prevents two members working the same issue." },
      { at: "The catalogue", say: "The curated repositories, filtered by level, domain and language." },
      { at: "Your contribution trail", say: "Claims you opened and what happened to them: merged, closed or still waiting." },
      { at: "Claim your contribution", say: "Records the issue or pull request you are taking, before you start." }
    ]
  },
  "/student/debug": {
    title: "Debug bounties",
    body: "Fork a published bug, fix it, and submit the fork for automated and human review.",
    sections: [
      { at: "Open challenges", say: "The published bounties for your domain. Read the reproduction steps before touching code." },
      { at: "How review works", say: "The automated check confirms the fork is yours and has the commit; a domain lead judges the fix." },
      { at: "Connect it first", say: "Shown when no GitHub account is linked, because a fork cannot be checked without one." }
    ]
  },
  "/student/debug/*": {
    title: "A debug challenge",
    body: "The brief, the failing behaviour and the submission control for one bounty.",
    sections: [
      { at: "The brief", say: "What is broken and how to reproduce it. This is the part people skip and then fail." },
      { at: "How it will be checked", say: "The automated fork check, then a human review. Both must pass before the bounty closes." },
      { at: "Submit your fork", say: "Records the fork URL. Keep the fix in its own commit so the review can see it." }
    ]
  },
  "/student/credentials": {
    title: "Your proof",
    body: "Every credential, badge and event certificate in one ledger, each with its own share control.",
    sections: [
      { at: "What becomes proof next.", say: "The shortest route to the next credential, based on what you have already done." },
      { at: "Archive register", say: "Credentials that are no longer current, kept for history rather than deleted." },
      { at: "Open the record", say: "Shows the evidence behind one credential and who verified it." }
    ]
  },
  "/student/certificates/*": {
    title: "An event certificate",
    body: "The printable record of attendance for one event, issued at check-in.",
    sections: [
      { at: "Certificate of participation", say: "The certificate itself. Check the name and the event before printing it." },
      { at: "Print / save PDF", say: "Opens the print dialog with the certificate laid out for paper or PDF." },
      { at: "Verify", say: "The code anyone can use to confirm the certificate is genuine, without a login." },
      { at: "Back to events", say: "Returns to the event list you registered from." }
    ]
  },
  "/student/contests": {
    title: "Contests",
    body: "Time-boxed challenges with registration, a deadline and a submission.",
    sections: [
      { at: "Earn it under pressure.", say: "What this page is for: a deadline, a brief and a submission, rather than an open-ended build." },
      { at: "Your challenges", say: "The contests you are registered for, with the clock on each." },
      { at: "What comes next", say: "What happens after the deadline: judging, then recognition as signed proof." }
    ]
  },
  "/student/contests/*": {
    title: "A contest",
    body: "The brief, the clock and your submission for one challenge.",
    sections: [
      { at: "From entry to proof.", say: "How a submission becomes recognised proof, and what judging looks at." },
      { at: "Register", say: "Enters you in the contest. The submit form only exists for registrants." },
      { at: "Submit your entry", say: "Records the link and what you built. You can replace it until submissions close." }
    ]
  },
  "/student/leaderboard": {
    title: "Standings",
    body: "The chapter board, built from verified work rather than logins.",
    sections: [
      { at: "Where steady work shows.", say: "The board is a record of verified work, not of activity. A quiet week drops you honestly." },
      { at: "How the score works", say: "The scoring rule and what deliberately does not count." },
      { at: "Find a builder by name or track", say: "Searches the board instead of scrolling it, useful once the chapter is large." }
    ]
  },
  "/student/insights": {
    title: "Your insights",
    body: "Your consistency, roadmap progress and where you stand, read back from recorded work.",
    sections: [
      { at: "The read", say: "One sentence on what the numbers actually say, before you read any chart." },
      { at: "The last 14 days", say: "The recent series. Look for gaps rather than for a peak." },
      { at: "Where this comes from", say: "The tables and jobs behind each figure, so a number can be checked rather than trusted." }
    ]
  },
  "/student/roles": {
    title: "Seats",
    body: "Ask for a Core or Head seat in a department, and see what you already hold.",
    sections: [
      { at: "What you have", say: "The seats you hold now, with the term end date on each." },
      { at: "Ask for a seat", say: "Opens the request. Say why you, in your own words - the lead reads that line." },
      { at: "Your requests", say: "What is pending and what was decided, with the reason if it was declined." }
    ]
  },
  "/student/mentorship": {
    title: "Mentorship",
    body: "Request a session with a mentor who opted in, and review it afterwards.",
    sections: [
      { at: "Find a guide", say: "Mentors who opted in, with their track and availability. Propose a topic and a time." },
      { at: "Become a guide", say: "Offers your own time as a mentor. The lead reviews the offer before it appears." },
      { at: "Sessions", say: "Requests and confirmed sessions, so nothing is lost between messages." }
    ]
  },
  "/student/help": {
    title: "Help requests",
    body: "Ask the chapter when you are stuck, with enough detail for someone to answer.",
    sections: [
      { at: "Stuck on something?", say: "Opens the request form. Say what you tried and what happened; a vague ask gets a vague answer." },
      { at: "Your requests", say: "What you have asked and its state. Mark it answered once it is resolved." },
      { at: "Help others", say: "Open requests from other members, which is where answering earns trust." }
    ]
  },
  "/student/community": {
    title: "Community",
    body: "Forums, the chapter wiki and code snippets, in one room.",
    sections: [
      { at: "The reading room.", say: "The three rooms: forums for questions, wiki for reference, snippets for code. Use the section links to move between them." },
      { at: "Ask a question", say: "Opens a forum thread. Search first - the answer is often already there." },
      { at: "The margin you keep.", say: "Your own notes and kept answers, private to you." }
    ]
  },
  "/student/community/forums": {
    title: "Forums",
    body: "Threads from the chapter, with votes and marked solutions.",
    sections: [
      { at: "Start a discussion", say: "Opens a new thread with a title, domain and tags." },
      { at: "Recent", say: "Sorts by last activity, which is what you want when following a thread." },
      { at: "Top", say: "Sorts by votes, which is what you want when looking for an answer." }
    ]
  },
  "/student/community/forums/*": {
    title: "A thread",
    body: "One conversation, its replies and the answer the author accepted.",
    sections: [
      { at: "Add your answer", say: "Posts a reply. Include what actually worked, not just that it worked." },
      { at: "Solution", say: "Marks a reply as the accepted answer. Only the thread's author can do this." },
      { at: "Replies", say: "The conversation in order. Vote the reply that helped instead of writing thanks." }
    ]
  },
  "/student/community/snippets": {
    title: "Code snippets",
    body: "Short, shared pieces of code with language and context.",
    sections: [
      { at: "Share a snippet", say: "Opens the form. Include the problem the snippet solves, not just the code." },
      { at: "Filter by language", say: "Narrows the list to one language so you are not reading PHP for a Python problem." },
      { at: "Copy", say: "Copies the snippet. Attribution stays on the original." }
    ]
  },
  "/student/community/wiki": {
    title: "Chapter wiki",
    body: "The chapter's own reference pages, edited by members and applied by admins.",
    sections: [
      { at: "New page", say: "Opens the editor with a title, domain and body. Search first to avoid a duplicate page." },
      { at: "Search wiki", say: "Matches page titles and content across the handbook." },
      { at: "Copy link", say: "Copies a stable link you can cite in a thread." }
    ]
  },
  "/student/community/wiki/*": {
    title: "A wiki page",
    body: "One reference page, with its version history and an edit control.",
    sections: [
      { at: "Improve this page", say: "Suggests a correction. Student edits wait for review; admin edits apply directly." },
      { at: "Review state", say: "Whether your suggestion is pending, applied or declined." },
      { at: "Copy link to this page", say: "Copies a stable URL for citing the page elsewhere." }
    ]
  },
  "/student/sponsors": {
    title: "Sponsors",
    body: "Who backs the chapter, what they support and the agreements behind it.",
    sections: [
      { at: "Backing this chapter", say: "The sponsors and the work they fund. Amounts and pipelines stay in admin finance." },
      { at: "Sponsors and partners.", say: "The framing for this page: what the chapter receives and what it commits to." }
    ]
  },
  "/student/events": {
    title: "Events",
    body: "Workshops, hackathons and talks, with registration and a door code per event.",
    sections: [
      { at: "Gatherings worth showing up for.", say: "Every event open to you, filtered by domain. Open one for venue, time and capacity." },
      { at: "Filters", say: "Narrows by domain and status. Clear filters resets both." },
      { at: "Add", say: "Registers you. Registration is what issues your door code." },
      { at: "View certificate", say: "Appears after check-in; it opens the certificate the chapter issued." }
    ]
  },
  "/student/events/*": {
    title: "An event",
    body: "The schedule, venue, materials and your registration for one event.",
    sections: [
      { at: "Your seat", say: "Your registration state, and the door code once you are registered." },
      { at: "Show this code at the door", say: "The code the organiser checks in. Keep this page open on arrival." },
      { at: "Materials", say: "Slides, recordings and links the organiser attached, usually after the event." },
      { at: "Add to calendar", say: "Downloads a calendar file so the time is not lost." }
    ]
  },
  "/student/discover": {
    title: "Discover",
    body: "Trending threads, rising builders and mentors worth knowing in your college.",
    sections: [
      { at: "Builders worth knowing", say: "People in your college with public proof. Open a card to see what they actually built." },
      { at: "New around here", say: "Members who joined recently. A first endorsement here goes a long way." },
      { at: "Discussed this week", say: "Threads with recent activity, so you can join a conversation that is still live." }
    ]
  },
  "/student/network": {
    title: "The federation",
    body: "Chapter profiles and federation totals, refreshed by the nightly rollup.",
    sections: [
      { at: "Find your chapter.", say: "Search across the federation, or start with the chapter you belong to." },
      { at: "Featured chapters", say: "Chapters with public activity. Totals move once a day, not live." },
      { at: "Sort chapters", say: "Orders by activity or name, so the list is not alphabetical by accident." }
    ]
  },
  "/student/network/*": {
    title: "A chapter",
    body: "One chapter's public profile: mission, links and aggregate activity.",
    sections: [
      { at: "Domains & departments", say: "What this chapter works on, which tells you whether their projects are relevant to you." },
      { at: "Top contributors", say: "Members with public proof. Open a card rather than guessing from a name." },
      { at: "Activity", say: "Aggregate activity from the federation rollup, so it lags by a day." }
    ]
  },
  "/student/feature-requests": {
    title: "Ideas",
    body: "Suggest and vote on what LOOM builds next; the ledger is shared with admins.",
    sections: [
      { at: "What should LOOM build next?", say: "Opens the new-idea form. Describe the problem before the solution." },
      { at: "Integration", say: "How the idea fits what already exists. An idea that duplicates a page gets merged." },
      { at: "Trade-offs", say: "What the idea costs or gives up. An idea with no trade-off is usually underspecified." }
    ]
  },
  "/student/notifications": {
    title: "Inbox",
    body: "Every notification, newest first, with the one link it is about.",
    sections: [
      { at: "Everything, in order.", say: "Every notification, newest first. The order is the reading order; nothing here is ranked by importance." },
      { at: "Notification views", say: "Filters to unread or to one kind of notification. Opening one marks it read and clears the nav dot." }
    ]
  },
  "/student/settings": {
    title: "Settings",
    body: "Your profile, handle, theme, privacy controls and the walkthrough replay.",
    sections: [
      { at: "Profile", say: "The fields leads and the public card read. Edit these first; everything else is cosmetic." },
      { at: "Appearance", say: "Theme and palette. Both themes are supported everywhere, so this is preference, not capability." },
      { at: "Privacy", say: "Usage analytics, exports and the controls you own. Opting out stops the tracker at the source." },
      { at: "Close account", say: "Irreversible. It deactivates the profile and erases identifying fields, keeping the work record." }
    ]
  },
  "/student/privacy": {
    title: "Privacy",
    body: "What this app stores, what it never stores, and the controls you own.",
    sections: [
      { at: "Close my account", say: "Starts the closure flow with its confirmation text. Some actions cannot be undone, so read first." },
      { at: "Keep my account", say: "Cancels the closure and returns you to the page." }
    ]
  },

  /* ------------------------------------------------------------------- lead */
  "/lead/overview": {
    title: "Your console",
    body: "Roster health, contribution output and the decisions that need a lead, in one read.",
    sections: [
      { at: "Queue", say: "Ordered by what needs a person first. Work it top to bottom; it is not a summary, it is the work." },
      { at: "Core requests", say: "Core seat requests waiting on you. Approve with the scope shown, or send it back with a reason." },
      { at: "Society events", say: "Chapter events awaiting your approval, and the ones already on the calendar." },
      { at: "What your numbers say", say: "The reading of your scope: roster health, output and the signals worth acting on." }
    ]
  },
  "/lead/departments": {
    title: "Departments",
    body: "The department workspaces you can see, with their roster size and current head.",
    sections: [
      { at: "Department workspaces.", say: "One card per department in your scope. Open a card for its roster, work board and report." },
      { at: "Technical", say: "Filters the list to technical departments." },
      { at: "Non-technical", say: "Filters the list to non-technical departments." }
    ]
  },
  "/lead/departments/*": {
    title: "A department",
    body: "One department's roster, work and report, scoped to what your role can edit.",
    sections: [
      { at: "Who leads it", say: "The live head, or an honest note that the seat is vacant. A department with no head cannot carry work." },
      { at: "Work board", say: "Tasks for this department, with owners and deadlines. Assign an owner before a task stalls." },
      { at: "Members", say: "The roster with levels and seats. Open a member for their contributions and current seat." },
      { at: "Reports", say: "The monthly report for this department: compile, read, then submit." }
    ]
  },
  "/lead/roster": {
    title: "Roster",
    body: "Every member in your scope, their level, and the Core requests you can act on.",
    sections: [
      { at: "Search roster", say: "Filters by name, year or GitHub handle, so you are not scanning a long table." },
      { at: "Filter roster by level", say: "Narrows to core, head or member when you are looking for one kind of person." },
      { at: "Core requests", say: "Requests waiting on you. Approve at the scope shown, or send back with a reason the member can act on." },
      { at: "Recently logged", say: "The newest contribution entries, which is how you check a claim before approving it." }
    ]
  },
  "/lead/members/*": {
    title: "A member",
    body: "One person's seats, contributions and work inside your scope.",
    sections: [
      { at: "Who they are", say: "Their department, year and handle. This is identity, not performance." },
      { at: "Where they stand", say: "Level, seats and term dates. Read the term end before changing anything." },
      { at: "Roadmap nodes", say: "The nodes they verified. Verified is the key word: completed alone does not appear here." },
      { at: "Seats", say: "Current seats and when each term ends. Anything outside your scope is absent, not forbidden." }
    ]
  },
  "/lead/events": {
    title: "Events",
    body: "Every chapter event you can edit, with its date, capacity and turnout state.",
    sections: [
      { at: "Events", say: "The list, filtered by status. Open an event to edit it, run check-in or read feedback." },
      { at: "Create event", say: "Schedules a new event with capacity, venue and materials." },
      { at: "All statuses", say: "Filters to published, live, completed or cancelled. Clear resets it." }
    ]
  },
  "/lead/events/new": {
    title: "Create an event",
    body: "Schedule a workshop, hackathon, talk or contest with a real capacity.",
    sections: [
      { at: "Event details", say: "Title, kind, venue and time. The kind drives how it appears in the planner." },
      { at: "What happens after you post", say: "Registration, the door code and the certificates. Read it before publishing a date." },
      { at: "Create an event", say: "Publishes the event to the chapter. Check the planner for clashes first." }
    ]
  },
  "/lead/events/*": {
    title: "An event",
    body: "The event's tasks, registrations, door check-in and feedback in one place.",
    sections: [
      { at: "Run this event", say: "The working view for the day: check-in, the ledger and who is on duty." },
      { at: "Door check-in", say: "Marks an attendee present with their code. Attendance is what issues a certificate." },
      { at: "Attendee ledger", say: "Registrations and who actually arrived. Export it when you need it outside LOOM." },
      { at: "Volunteer roster", say: "Who is working the event, so the same person is not on two tasks." }
    ]
  },
  "/lead/workshops": {
    title: "Workshops",
    body: "Upcoming seat fill and how many people actually showed up last time.",
    sections: [
      { at: "Calendar", say: "What is scheduled and when. A workshop below capacity is worth rescheduling rather than re-advertising." },
      { at: "Create event", say: "Schedules another workshop with its capacity." },
      { at: "Society events", say: "Chapter-wide events that affect turnout on the same week." }
    ]
  },
  "/lead/event-ops": {
    title: "Event operations",
    body: "Tasks and deadlines for the events you own, across the run-up and the day itself.",
    sections: [
      { at: "Task board", say: "Every task across your events. Overdue tasks are surfaced first." },
      { at: "Assign an owner", say: "Gives a task to a member with a deadline. Unassigned work is the usual reason an event slips." },
      { at: "Event operations.", say: "The framing for this board: run-up tasks and day-of tasks live together." }
    ]
  },
  "/lead/challenges": {
    title: "Challenges",
    body: "Chapter challenges with their registration and submission counts.",
    sections: [
      { at: "Chapter challenges", say: "Every challenge in your scope, with registrations against submissions." },
      { at: "Open a challenge", say: "Shows the brief and its counts. A low submission rate is usually a brief problem." },
      { at: "Who can do what", say: "What a lead may change here, and what stays with an admin." }
    ]
  },
  "/lead/practice": {
    title: "Practice room",
    body: "The weekly seven, this week's assignments and any corrections you owe.",
    sections: [
      { at: "Weekly assignments", say: "What is set for the current week. Assign it before the week starts; students see the same set." },
      { at: "Recent corrections", say: "Corrections waiting for review. They change what the board counts, so read before approving." },
      { at: "Sync health", say: "The last practice sync and its failures, which explains a member's missing solves." }
    ]
  },
  "/lead/debug": {
    title: "Debug queue",
    body: "Verified forks waiting for a human review, newest first.",
    sections: [
      { at: "Debug queue", say: "Forks the automated check already accepted. Open the diff and judge the fix itself." },
      { at: "Waiting for a human", say: "The count still on your desk, per domain." },
      { at: "Approved in your domain", say: "What you already approved, so a re-submission is recognisable." }
    ]
  },
  "/lead/planner": {
    title: "Planner",
    body: "The shared society calendar, where sessions and deadlines are laid out for the cohort.",
    sections: [
      { at: "Run the shared society calendar.", say: "All six wings in one place. Check for clashes before adding anything to a busy week." },
      { at: "Session ownership", say: "Who owns each session, and where a departing holder's sessions can be passed on." },
      { at: "Shared calendar", say: "The term's sessions and events. Students see the same calendar on their Planner page." }
    ]
  },
  "/lead/reports": {
    title: "Reports",
    body: "Monthly department reports, the contribution ledger and the calendar.",
    sections: [
      { at: "Monthly report", say: "This month's draft or the submitted version. Read it before submitting; a submitted report locks." },
      { at: "Recently logged", say: "The newest contribution entries, which is the evidence behind the report's numbers." },
      { at: "Calendar", say: "Scheduling conflicts for the month, so the report can explain a quiet week honestly." }
    ]
  },
  "/lead/analytics": {
    title: "Usage",
    body: "Where the chapter actually goes: route traffic, tour drop-off and destinations nobody finds.",
    sections: [
      { at: "Journey", say: "Page views, visitors per active day and the signed-in share. Visitors are counted per route on purpose." },
      { at: "Tour funnel", say: "Where a walkthrough loses people. A big drop at step two is a copy problem, not a user problem." },
      { at: "Hard to reach", say: "Advertised destinations almost nobody opens, which is where a link is missing." }
    ]
  },
  "/lead/succession": {
    title: "Succession",
    body: "Who is ready to carry a department forward when a term ends.",
    sections: [
      { at: "Reading of your scope", say: "Readiness signals per member: verified nodes, merges, projects and solutions." },
      { at: "Approve", say: "Approves a flagged successor. A handover is approved by an admin, never by the person leaving." },
      { at: "Send back", say: "Returns the suggestion with a note instead of deciding it." }
    ]
  },
  "/lead/assets": {
    title: "Assets",
    body: "The shared creative shelf: logos, templates and decks, with versions.",
    sections: [
      { at: "The shelf", say: "Every asset and its current version. Download the current one; old versions stay available." },
      { at: "Creative asset library.", say: "What belongs here: chapter-owned creative, not personal files." },
      { at: "Download", say: "Fetches the current file through a signed URL." }
    ]
  },
  "/lead/directory": {
    title: "Directory",
    body: "Leads and heads, current and past, with their departments and terms.",
    sections: [
      { at: "The directory", say: "Current and past leadership. An ended term shows history without authority." },
      { at: "Search", say: "Matches names, departments and verticals." }
    ]
  },
  "/lead/mous": {
    title: "MoUs",
    body: "Chapter agreements with their partners, renewal dates and expiry state.",
    sections: [
      { at: "Agreement ledger", say: "Every agreement and its state. Read the renewal date before acting; expired rows are marked." },
      { at: "MoU database.", say: "The signed documents live with the agreement, not in a message thread." }
    ]
  },
  "/lead/announcements": {
    title: "Announcements",
    body: "Compose and publish a chapter announcement, or keep it as a draft.",
    sections: [
      { at: "Composer", say: "The body and the targeting fields. A draft is private until you publish it." },
      { at: "Publish", say: "Sends it and notifies the targeted members once." },
      { at: "Announcements.", say: "The list of what was already sent, so the chapter is not told the same thing twice." }
    ]
  },

  /* ------------------------------------------------------------------ admin */
  "/admin": {
    title: "Chapter overview",
    body: "Chapter totals, the attention queue and the latest admin actions on one desk.",
    sections: [
      { at: "The shape of the chapter.", say: "Totals for people, departments and activity, scoped to this chapter." },
      { at: "Attention queue", say: "What needs a human today. Open a card to reach the screen that owns the number." },
      { at: "Departments", say: "Department cards with their heads. Create department adds one with its vertical." },
      { at: "Trail", say: "The newest admin actions, which is the audit log's first page." }
    ]
  },
  "/admin/students": {
    title: "Students",
    body: "The roster with role, department and onboarding state.",
    sections: [
      { at: "Select all on this page", say: "Marks every visible student for a batch change. It is per page, not the whole roster." },
      { at: "Bulk assign", say: "Opens the batch panel: role and department, applied to everyone selected." },
      { at: "New role", say: "Sets the role the batch will apply. A role change needs a scope and a term end date." },
      { at: "Confirm batch change", say: "Applies the change. Read the confirmation; it names how many records move." }
    ]
  },
  "/admin/students/*": {
    title: "A student",
    body: "One member's record: seats, contributions, proof and role controls.",
    sections: [
      { at: "Profile", say: "Identity and contact fields. Changing them is a data edit, and it is audited." },
      { at: "Role management", say: "Role, department and term end. It applies immediately and cannot be undone by the member." },
      { at: "Onboarding", say: "Whether the member finished setup, which explains a thin profile." },
      { at: "Offboarding", say: "Suspend, close or reactivate. Closure erases identifying fields and keeps the work record." }
    ]
  },
  "/admin/mentors": {
    title: "Mentors",
    body: "Who mentors, when they are available and which sessions they have taken.",
    sections: [
      { at: "Roster", say: "Current mentors. Add mentor pulls someone from the student roster." },
      { at: "Candidacies", say: "Applications waiting on a decision. Declines notify the applicant." },
      { at: "Session operations", say: "Sessions requested and completed. Effectiveness comes from completed sessions, not requests." },
      { at: "How candidacies work", say: "The rule for who can mentor and what a decision records." }
    ]
  },
  "/admin/departments": {
    title: "Departments",
    body: "Create, rename and archive departments, and see their current heads.",
    sections: [
      { at: "Active departments", say: "The current org. Archiving keeps history and does not delete members." },
      { at: "New department", say: "Creates one with its vertical and first head. A department needs a live head before it can carry work." },
      { at: "Shape of the org", say: "The framing: departments, verticals and who reports where." }
    ]
  },
  "/admin/requests": {
    title: "Seat requests",
    body: "Core and Head requests waiting on a decision.",
    sections: [
      { at: "Waiting on a decision", say: "The open requests. Read the verified proof and chapter position, not just the pitch." },
      { at: "Recently decided", say: "What was decided and by whom. The requester is notified either way." },
      { at: "Queue is clear", say: "The honest empty state, so a quiet queue is not mistaken for a failed load." }
    ]
  },
  "/admin/roadmaps": {
    title: "Roadmaps",
    body: "Publish paths and nodes, set difficulty and decide what a node requires.",
    sections: [
      { at: "Nodes", say: "The catalogue. A required evidence type blocks completion until it is attached." },
      { at: "Add a node", say: "Opens the node form with resources and requirements. Publishing changes what every student on that track sees." },
      { at: "How roadmaps work", say: "The rules for publishing, ordering and retiring a node." }
    ]
  },
  "/admin/resources": {
    title: "Resources",
    body: "Curate the library per track, level and kind.",
    sections: [
      { at: "Catalog", say: "Every resource with its track and kind. Resources attached to a node appear in that node's shelf." },
      { at: "Add a resource", say: "Adds one to the library. Retiring it keeps existing completions intact." }
    ]
  },
  "/admin/opensource": {
    title: "Open source console",
    body: "Tracked repositories, their live GitHub metadata and the claims on them.",
    sections: [
      { at: "Curated projects", say: "The tracked repositories. Metadata is refreshed and stamped with its sync time." },
      { at: "Pending claims", say: "Claims waiting on you. The link must match both the repository and the claim before you confirm." },
      { at: "Curate a new repo", say: "Adds a repository with its difficulty and domain." },
      { at: "Society challenge queue", say: "Chapter-wide challenge forks waiting to be graded." }
    ]
  },
  "/admin/community": {
    title: "Community moderation",
    body: "Flagged threads, replies and the wiki suggestion queue.",
    sections: [
      { at: "Flagged threads", say: "Reported threads with their reason. Hiding removes them from student views but keeps the row for audit." },
      { at: "Flagged replies", say: "The same queue at reply level, which is usually where spam lands." },
      { at: "Wiki review queue", say: "Suggestions waiting to be applied. Approving one applies it and bumps the version." },
      { at: "Hidden content", say: "What is currently hidden from members, so a wrong call can be reversed." }
    ]
  },
  "/admin/contests": {
    title: "Contests",
    body: "Create and run challenges: registrations, submissions and judging.",
    sections: [
      { at: "New contest", say: "Creates one. It needs a deadline before it can accept submissions." },
      { at: "Submissions inbox", say: "Entries to judge. Recognising an entry issues proof to the student." },
      { at: "Contests", say: "Every contest with its status: draft, published, open, active or closed." }
    ]
  },
  "/admin/practice": {
    title: "Practice room",
    body: "The weekly seven, corrections and the practice board's inputs.",
    sections: [
      { at: "Weekly assignments", say: "The set for the current week. Publish it before the week starts; the whole chapter shares it." },
      { at: "Corrections", say: "Corrections waiting for review. Approving one changes what the board counts." },
      { at: "Sync health", say: "The last sync and its failures, which is where a missing solve usually starts." }
    ]
  },
  "/admin/debug": {
    title: "Debug and build",
    body: "Author and publish debug challenges, then review verified forks.",
    sections: [
      { at: "Challenge catalogue", say: "Every published challenge with its starter repository and brief." },
      { at: "Submissions", say: "Forks waiting for a human. The automated check is not the verdict." },
      { at: "Debug & build", say: "The two halves of this page: authoring a bounty, and reviewing the fixes." }
    ]
  },
  "/admin/events": {
    title: "Events console",
    body: "Every chapter event, its capacity, registrations and check-in state.",
    sections: [
      { at: "Events console", say: "The list, filtered by status. Open an event to run it or read its feedback." },
      { at: "Schedule an event", say: "Publishes a new event with capacity and venue." },
      { at: "All statuses", say: "Filters to published, live, completed or cancelled." }
    ]
  },
  "/admin/events/*": {
    title: "An event",
    body: "One event's tasks, registrations, volunteers and attendance.",
    sections: [
      { at: "Run this event", say: "The working view for the day: check-in, ledger and volunteers." },
      { at: "Door check-in", say: "Marks an attendee present with their code. Attendance issues the certificate." },
      { at: "Attendee ledger", say: "Who registered and who arrived. Export it for records outside LOOM." },
      { at: "Volunteer roster", say: "Who is on duty, so the same person is not assigned twice." }
    ]
  },
  "/admin/planner": {
    title: "Planner",
    body: "The collective 28-week calendar for the chapter and its sessions.",
    sections: [
      { at: "Collective master planner", say: "The term's calendar. Sessions added here appear on every student's planner." },
      { at: "Schedule a society event", say: "Adds a session or event to a week, with its owner." },
      { at: "Owners & ops notes", say: "Who owns each week, and the notes that explain a lighter or blocked week." }
    ]
  },
  "/admin/projects": {
    title: "Projects",
    body: "Student builds with their repository, tags and review state.",
    sections: [
      { at: "Project ledger", say: "Every project with its status. Recognising one is a proof decision, not a content edit." },
      { at: "All statuses", say: "Filters to active, in review, completed, rejected or archived." },
      { at: "Open", say: "Opens the project record: summary, tags and commits." }
    ]
  },
  "/admin/assets": {
    title: "Creative assets",
    body: "The shared shelf of logos, templates and decks, with version history.",
    sections: [
      { at: "The shelf", say: "Every asset and its current version. Upload a new version instead of replacing the file." },
      { at: "Creative assets.", say: "What belongs here: chapter-owned creative, inside the seeded categories." }
    ]
  },
  "/admin/mous": {
    title: "MoUs",
    body: "Agreements with partners, their renewal dates and expiry state.",
    sections: [
      { at: "Agreement ledger", say: "Every agreement and its state. Attach the signed document to the record, not to a message." },
      { at: "MoU database.", say: "Expiring agreements are surfaced before they lapse." }
    ]
  },
  "/admin/directory": {
    title: "Leadership directory",
    body: "Every lead and head, current and past, with term dates.",
    sections: [
      { at: "The directory", say: "Current and past leadership. An ended term keeps the title and removes authority." },
      { at: "Search", say: "Matches names, departments and verticals." }
    ]
  },
  "/admin/event-ops": {
    title: "Event operations",
    body: "The task board behind every event, with owners and deadlines.",
    sections: [
      { at: "Task board", say: "Every task across the chapter's events. Overdue tasks surface first." },
      { at: "Assign an owner", say: "Gives a task to a member. Completing it notifies the owner." },
      { at: "Event operations.", say: "Run-up and day-of tasks live on the same board." }
    ]
  },
  "/admin/announcements": {
    title: "Announcements",
    body: "Compose, draft and publish chapter announcements.",
    sections: [
      { at: "Composer", say: "The body and the targeting fields. Drafts stay private until published." },
      { at: "Publish", say: "Sends it and notifies the targeted members once." },
      { at: "Announcements.", say: "What was already sent, so the chapter is not told the same thing twice." }
    ]
  },
  "/admin/verification": {
    title: "Verification console",
    body: "Skill badges, achievements awaiting review and the live share links.",
    sections: [
      { at: "Proof awaiting review", say: "Claims that need a human. Confirm against the linked artefact, not the summary." },
      { at: "Badge definitions", say: "Define a badge and its tiers before issuing anything." },
      { at: "Issue an achievement", say: "Records manual proof. Issuing notifies the student and becomes shareable." },
      { at: "Verification audit", say: "What was issued, to whom and by which admin." }
    ]
  },
  "/admin/ranking": {
    title: "Evidence review",
    body: "Claimed evidence waiting for a human to confirm it.",
    sections: [
      { at: "Review queue", say: "Claims waiting on you. Open the artefact before deciding; the summary is not the evidence." },
      { at: "What you are confirming", say: "What the decision records, so a rejection can be explained." },
      { at: "Queue clear", say: "The honest empty state when nothing is waiting." }
    ]
  },
  "/admin/analytics": {
    title: "Chapter analytics",
    body: "Cohort health, funnels, mentor effectiveness and where usage actually goes.",
    sections: [
      { at: "Chapter analytics", say: "The cohort sections. Every figure names its denominator; a percentage without one is a bug." },
      { at: "Funnel bottlenecks", say: "Where a funnel loses people, and which step to fix first." },
      { at: "Mentor effectiveness", say: "Completed sessions against requests, per mentor." },
      { at: "Journey", say: "Usage: page views, visitors per active day and the routes nobody opens." }
    ]
  },
  "/admin/finance": {
    title: "Finance",
    body: "Budget heads, proposed expenses and the sponsorship pipeline.",
    sections: [
      { at: "Approval queue", say: "Expenses waiting on a decision. A Vertical Lead can propose but never approve." },
      { at: "Budget heads", say: "Allocated amounts and what remains. Approving changes the balance immediately." },
      { at: "Sponsorship pipeline", say: "Sponsors by stage. Mark paid only once the transfer actually happened." },
      { at: "Propose an expense", say: "Opens the form for a new expense against a budget head." }
    ]
  },
  "/admin/reports": {
    title: "Department reports",
    body: "Submitted monthly reports and the semester or annual export.",
    sections: [
      { at: "Submitted reports", say: "Only submitted reports are exported. Reopening one is an admin action and is audited." },
      { at: "Export", say: "Pick the period and the format: JSON, CSV or PDF." },
      { at: "Coverage", say: "Which departments have reported for the period, so a gap is visible before the export." }
    ]
  },
  "/admin/settings": {
    title: "Settings",
    body: "Chapter identity, public card and the configuration other screens read.",
    sections: [
      { at: "Tenant identity", say: "Name, slug and public details. These drive the chapter's public page and change for every member at once." },
      { at: "Integrations", say: "GitHub and webhook connection state. A broken integration stops attribution, not access." },
      { at: "Feature flags", say: "Chapter-level switches. Off is the default; turn something on when the chapter can support it." }
    ]
  },
  "/admin/handover": {
    title: "Handover",
    body: "Leadership terms ending soon and the queue for guided seat transfers.",
    sections: [
      { at: "Transfer progress", say: "How far each handover has got. You cannot approve your own." },
      { at: "Terms ending soon", say: "Seats whose term is nearly over, so a department is not left without a head." },
      { at: "Seat handovers", say: "Pending transfers. Read the outgoing brief before approving one." },
      { at: "Outstanding succession items", say: "What still blocks a handover: a missing successor, an unapproved transfer or an open term conflict." }
    ]
  },
  "/admin/flags": {
    title: "Feature flags",
    body: "Chapter-level switches for features that are built but not yet on everywhere.",
    sections: [
      { at: "Chapter controls", say: "What this chapter may switch on, and what stays with the operator." },
      { at: "Feature flags", say: "Every flag with its current state. A flag changes what the chapter sees, not the code." },
      { at: "Operator-only", say: "Flags only a platform admin can change, shown read-only here." }
    ]
  },
  "/admin/faq": {
    title: "FAQ",
    body: "The public questions the site answers, and the answers themselves.",
    sections: [
      { at: "Add FAQ", say: "Opens the form. Search first; duplicates split the answer in two places." },
      { at: "FAQ", say: "The ledger. Unpublish rather than delete when a question stops applying." },
      { at: "Search FAQ", say: "Matches questions and slugs before you scroll, so a duplicate question is easy to spot." }
    ]
  },
  "/admin/audit": {
    title: "Audit log",
    body: "Every admin action with its before and after, newest first.",
    sections: [
      { at: "Audit stream", say: "The log itself. Open a row for the before and after values." },
      { at: "Search audit log", say: "Matches action, resource or actor before you scroll." },
      { at: "Filter", say: "Applies the exact action and resource filters." }
    ]
  },
  "/admin/feature-requests": {
    title: "Feature requests",
    body: "The idea ledger, with votes and the state each request is in.",
    sections: [
      { at: "Request ledger", say: "Every idea with its votes and status. Merge duplicates so votes land in one place." },
      { at: "Create GitHub issue", say: "Opens an issue from the request once it is ready to be built." },
      { at: "Let them build", say: "Moves the request to building, which the member can see." }
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

/**
 * Resolve the walkthrough for a pathname: exact route, then the longest `*`
 * family, then the member-profile pattern. Unknown sub-routes get no tour - a
 * generic tour over the wrong page is worse than none - and the coverage test
 * makes sure a real page cannot end up in that state.
 */
export function guideForPath(pathname, tourState = null) {
  const path = normalizePath(pathname || "/");

  let entry = null;
  let key = null;
  if (PAGE_GUIDES[path]) {
    entry = PAGE_GUIDES[path];
    key = path;
  } else {
    let best = null;
    for (const candidate of Object.keys(PAGE_GUIDES)) {
      if (!candidate.endsWith("/*")) continue;
      const prefix = candidate.slice(0, -1);
      if (!path.startsWith(prefix) || path.length <= prefix.length) continue;
      if (!best || candidate.length > best.length) best = candidate;
    }
    if (best) {
      entry = PAGE_GUIDES[best];
      key = best;
    } else {
      for (const rule of PATTERN_GUIDES) {
        if (rule.pattern.test(path)) {
          entry = rule;
          key = rule.key;
          break;
        }
      }
    }
  }
  if (!entry) return null;

  const id = `guide-${slugFor(key)}`;
  const version = Number(entry.version) || PAGE_GUIDE_VERSION;
  const raw = tourState && typeof tourState === "object" ? tourState[id] : null;
  return {
    id,
    key,
    path,
    version,
    title: entry.title,
    body: entry.body,
    sections: entry.sections || [],
    seen: Number(raw) >= version
  };
}

/** localStorage mirror key; the profile's tour_state is the cross-device copy. */
export function guideStorageKey(userId, guide) {
  return `loom-guide:${userId || "anon"}:${guide.id}:${guide.version}`;
}
