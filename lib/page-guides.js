/**
 * How each private page works.
 *
 * Every screen under /student, /lead and /admin gets an entry that answers
 * three questions in order:
 *   1. body     - what this page is for, in one sentence.
 *   2. flow     - the order work actually moves through the page.
 *   3. controls - what each real control on the page does, named as it appears
 *                 on screen.
 *
 * The copy lives here rather than in 70 components so it can be reviewed as one
 * document, and so a new page fails `tests/page-guides.test.js` instead of
 * silently shipping with no explanation.
 *
 * Keys are real routes. A key ending in `/*` covers the detail pages under it
 * (`/student/projects/*` is one project, not the list). `/student/:member` is
 * the public handle pattern. Each workspace also has a fallback, so an unknown
 * sub-route still explains the area instead of going quiet.
 *
 * `controls` labels are checked against the product source by the test, so a
 * renamed button fails the build rather than leaving a lie on the page. Bump
 * `version` when the copy is meaningfully rewritten, so members see it again.
 */
import { normalizePath } from "./routes";

export const PAGE_GUIDE_VERSION = 2;

const PATTERN_GUIDES = [
  {
    key: "/student/:member",
    pattern: /^\/student\/[^/]+$/,
    title: "A member profile",
    body: "Someone's public identity card: their proof, their reputation and the work they chose to show.",
    flow: [
      "Read the card first - track, seats and verified proof are what the chapter actually checked.",
      "Use Share to pass the card on, or Endorse a skill you have seen them use.",
      "Open the chapter record only if you are a lead reviewing them; the private folio is scoped."
    ],
    controls: [
      ["View public card", "Opens the shareable version of this profile."],
      ["Endorse a skill", "Adds your endorsement to a skill on their card."],
      ["Share", "Copies or opens the card's share link."],
      ["Chapter record", "Shows the scoped view a lead sees, if your role allows it."]
    ]
  }
];

export const AREA_GUIDES = Object.freeze({
  student: {
    title: "The student workspace",
    body: "Five verbs organise every student screen: Learn, Build, Prove, Connect and Discover.",
    flow: [
      "Use the top bar on a laptop or the bottom bar on a phone; both point at the same routes.",
      "Start from Home when you are unsure - it names the next useful action.",
      "Open Settings to replay this walkthrough or switch usage analytics off."
    ],
    controls: [
      ["Home", "Returns to the dashboard with the next step for this week."],
      ["Settings", "Profile, handle, theme, privacy and the walkthrough replay."],
      ["The bell", "Shows anything waiting on you; opening one clears it."]
    ]
  },
  lead: {
    title: "The lead console",
    body: "Everything you can act on as a department Head or Vertical Lead, scoped to your own people.",
    flow: [
      "Sections open from the top bar; each one is its own URL, so refresh and back both work.",
      "Start on Overview - it is the only screen that gathers what needs a lead.",
      "Anything outside your scope is absent rather than disabled: the server never sends it."
    ],
    controls: [
      ["Overview", "The queue of decisions, roster health and the live feed."],
      ["Roster", "Members in your scope, their level and pending Core requests."],
      ["Reports", "The contribution ledger and the monthly department report."]
    ]
  },
  admin: {
    title: "The admin workspace",
    body: "Chapter operations, grouped by what you are changing: people, content, programs, trust and system.",
    flow: [
      "Use the top bar to switch group, then pick the exact screen from its menu.",
      "Overview gathers the queues that need an admin; open a card to act on it.",
      "Every write here lands in Audit, so act as if the log is public - it is to your successors."
    ],
    controls: [
      ["Overview", "Chapter totals, attention queue and the latest admin actions."],
      ["Audit", "The append-only record of every admin action, newest first."],
      ["Settings", "Chapter identity, the public card and integration switches."]
    ]
  }
});

export const PAGE_GUIDES = Object.freeze({
  /* ---------------------------------------------------------------- student */
  "/student": {
    title: "Your Home screen",
    body: "The one screen that gathers the week: the next step, your rhythm, and what is waiting on you.",
    flow: [
      "Read the next-step card first; it names the single most useful action right now.",
      "Work the Start-here checklist on a new account - it disappears once every step is done.",
      "Use the tiles under it to jump into the roadmap, the planner or a project instead of re-navigating."
    ],
    controls: [
      ["Continue", "Opens whatever the next-step card points at: a node, a practice set or a build."],
      ["View roadmap", "Jumps to the roadmap graph at your current position."],
      ["Open planner", "Opens the shared calendar when the chapter has switched it on."],
      ["Find an OSS issue", "Filters the open-source portal to issues that match your track."],
      ["Open proof", "Opens the credential ledger where badges and share links live."]
    ]
  },
  "/student/onboarding": {
    title: "Set your direction",
    body: "The first-run screen: pick a track, claim a handle, and connect the account your work will be proven from.",
    flow: [
      "Choose the track you want to start on; it unlocks that roadmap immediately.",
      "Claim your handle - it becomes /student/<handle> and is hard to change later.",
      "Connect GitHub so commits and merged pull requests can be attributed to you."
    ],
    controls: [
      ["Claim your handle", "Reserves the public username your profile and proof links use."],
      ["Connect GitHub", "Links your GitHub account so commits and merges are counted for you."],
      ["Walk the first node", "Opens the first roadmap node for the track you picked."]
    ]
  },
  "/student/roadmap": {
    title: "The roadmap graph",
    body: "Your track drawn as a path: what is done, what is up next, and what each node needs before it closes.",
    flow: [
      "Swipe or scroll the map sideways to explore; the page keeps your position.",
      "Open a node, read its resources, then complete it - a node that requires evidence will not close without it.",
      "Use the side panel for the same domain's challenges and open source, so practice stays next to theory."
    ],
    controls: [
      ["Return to your position", "Scrolls the map back to the node you are working on."],
      ["Prove this track", "Opens the challenge and proof panel for the track you are reading."],
      ["Submit a fork", "Opens the fork submission path for this domain."],
      ["Open folder", "Opens the resource folder attached to the selected node."],
      ["Browse the library", "Goes to the resource library filtered to this track."]
    ]
  },
  "/student/roadmap/*": {
    title: "A roadmap node",
    body: "One step of the path: what to learn, the material attached, and the evidence that closes it.",
    flow: [
      "Read the node's outcomes before opening anything, so you know when you are done.",
      "Work the attached resources, then mark the node complete.",
      "Move with previous and next so the path keeps its order."
    ],
    controls: [
      ["Back to path", "Returns to the graph with your position kept."],
      ["Study this", "Opens the resource shelf attached to this node."],
      ["Open resource", "Opens one attached resource in a new tab."]
    ]
  },
  "/student/challenges": {
    title: "Domain challenges",
    body: "Open challenges for your track, and the proof route each one leads to.",
    flow: [
      "Pick the challenge that matches the node you are on.",
      "Read the rules and the repository before forking anything.",
      "Claim the pull request so nobody else works the same issue."
    ],
    controls: [
      ["Fork on GitHub", "Creates your own copy of the challenge repository in a new tab."],
      ["Open repository", "Opens the upstream repository the challenge is based on."],
      ["Claim a pull request", "Records the PR URL so the work is attributed and not duplicated."],
      ["Open practice room", "Goes to the weekly practice set for this domain."]
    ]
  },
  "/student/practice": {
    title: "The weekly practice set",
    body: "Seven problems a week, the same set for the whole chapter, scored on consistency.",
    flow: [
      "Solve in your own editor, then log the attempt with the problem and its outcome.",
      "Mark solved only when the judge has accepted it - the board reads that flag.",
      "Check the weekly board to see what your streak is worth."
    ],
    controls: [
      ["Log attempt", "Records one attempt against the current week's problem."],
      ["Mark solved", "Marks a problem solved and adds its points to this week."],
      ["Change handle", "Updates the handle used to sync your practice account."],
      ["Clear filters", "Resets the problem list back to the full weekly set."]
    ]
  },
  "/student/practice/leaderboard": {
    title: "Practice standings",
    body: "This week's practice board, ordered by the work actually recorded.",
    flow: [
      "Read the top of the board, then find your own row.",
      "Open the rules before arguing with a score; ties share a rank.",
      "Go back to the set to record what is missing."
    ],
    controls: [
      ["Back to this week", "Returns to the practice set you are working."],
      ["This week", "Shows the current week's board."],
      ["This month", "Shows the month's board, with the same scoring rule."],
      ["See how chapter standing works", "Expands the scoring rules and how ties are ranked."]
    ]
  },
  "/student/planner": {
    title: "The collective planner",
    body: "The chapter's shared 28-week calendar: sessions, deadlines and what the whole cohort is doing.",
    flow: [
      "Open a session for its agenda, owner and attached material.",
      "Filter by kind so a talk does not look like a deadline.",
      "If the planner is switched off, the page says so and sends you back to your roadmap."
    ],
    controls: [
      ["Back to your dashboard", "Returns to Home when the planner is not switched on yet."],
      ["Jump to week", "Moves the calendar to a specific week of the term."],
      ["Filter by wing", "Narrows the calendar to one wing or track."],
      ["Export .ics", "Downloads the calendar for another app."]
    ]
  },
  "/student/resources": {
    title: "The resource library",
    body: "Curated material across the tracks, filtered by level and kind so the next hour is not a search.",
    flow: [
      "Filter by track, level and kind, then search by title or description.",
      "Open a resource, use it, and mark it complete.",
      "Marking it complete counts as progress on the roadmap nodes it supports."
    ],
    controls: [
      ["Search", "Matches titles and descriptions, not full text."],
      ["Clear all", "Removes every filter and returns the full library."],
      ["Browse by track", "Groups the library by track instead of by level."],
      ["Open resource", "Opens one resource in a new tab."]
    ]
  },
  "/student/resources/*": {
    title: "A resource",
    body: "One resource, the roadmap nodes it supports, and a completion control.",
    flow: [
      "Read it or watch it, then mark it complete - that is what feeds the roadmap.",
      "Follow the node links back into the path you were on.",
      "If it is marked unavailable, the link is dead: report it rather than guessing."
    ],
    controls: [
      ["Return to your path", "Goes back to the roadmap you came from."],
      ["Open & record", "Opens the resource and marks it complete in one action."],
      ["Open resource", "Opens the resource without recording it."]
    ]
  },
  "/student/projects": {
    title: "Projects",
    body: "Ship work in public and keep the proof attached: repository, tags and a readable summary.",
    flow: [
      "Start a project and link the repository that makes it verifiable.",
      "Write the summary for a lead who is deciding whether to recognise it.",
      "Move it from active to shipped when the work is actually done."
    ],
    controls: [
      ["Start a project", "Opens the new-project form with repository linking."],
      ["Search", "Filters your projects by name, tag or repository."],
      ["Status", "Filters to active, shipped or all projects."],
      ["Clear filters", "Resets search and status together."]
    ]
  },
  "/student/projects/new": {
    title: "New project",
    body: "Create the project record first; the repository link is what makes it verifiable later.",
    flow: [
      "Pick a connected repository, or paste its URL if it is not in the list.",
      "Write a summary a stranger could understand in one read.",
      "Create it, then add tags and a domain so it can be found."
    ],
    controls: [
      ["My GitHub repos", "Lists repositories from your linked account."],
      ["Paste a URL", "Switches to manual entry for a repository not in the list."],
      ["Link GitHub", "Starts the account link when GitHub is not connected yet."],
      ["Load more repositories", "Fetches the next page of your repositories."]
    ]
  },
  "/student/projects/*": {
    title: "A project",
    body: "The project's public record: what it does, what it is built with, and the commits behind it.",
    flow: [
      "Read the case study sections - problem, solution, architecture - before the repository.",
      "Owners edit the details here; leads read the same page when reviewing.",
      "Proof status tells you whether the chapter has recognised it yet."
    ],
    controls: [
      ["Edit project details", "Opens the owner form for summary, tags and lifecycle."],
      ["Open repository", "Opens the linked repository in a new tab."],
      ["Case study", "Shows the written sections rather than the code."]
    ]
  },
  "/student/work": {
    title: "Department work",
    body: "Tasks a department head assigned to you, with the link they need to verify your part.",
    flow: [
      "Read the task and its deadline; overdue work is highlighted rather than hidden.",
      "Submit a link to the work, not a claim about it.",
      "The head verifies before it counts as done."
    ],
    controls: [
      ["Open the event", "Opens the event a task belongs to."],
      ["Your work", "Lists the tasks assigned to you in this department."],
      ["Event operations", "Shows the shared task board for events you are on."]
    ]
  },
  "/student/github": {
    title: "GitHub proof",
    body: "Link your username so webhook commits are attributed to you, then grant repository access if needed.",
    flow: [
      "Link your account; nobody can claim your username for you.",
      "Grant access to the repositories you want counted.",
      "Refresh activity to pull recent commits into the heatmap."
    ],
    controls: [
      ["Add repositories", "Grants access to more of your repositories."],
      ["Find a repository", "Searches the repositories already granted."],
      ["Export activity", "Downloads the activity shown on this page as JSON."],
      ["Open on GitHub", "Opens the same activity on github.com."],
      ["Disconnect", "Removes the link and stops attribution."]
    ]
  },
  "/student/opensource": {
    title: "Open source",
    body: "Curated repositories with real good-first issues, and a claim for the work you are doing.",
    flow: [
      "Filter by level, domain and language to find something you can finish.",
      "Claim the issue or PR URL before starting, so two members do not collide.",
      "Merged pull requests verify automatically and award badges."
    ],
    controls: [
      ["Apply", "Applies the chosen filters to the repository list."],
      ["Clear all", "Removes every filter."],
      ["Claiming in", "Opens the claim form for an issue or PR."],
      ["Best match", "Sorts by fit with your track rather than by stars."]
    ]
  },
  "/student/debug": {
    title: "Debug bounties",
    body: "Fork a published bug, fix it, and submit the fork for automated and human review.",
    flow: [
      "Open a challenge and read its reproduction steps before touching code.",
      "Fork, fix in its own commit, then submit the fork URL.",
      "The automated check confirms the fork; a domain lead reviews the fix."
    ],
    controls: [
      ["Open challenges", "Shows the published bounties for your domain."],
      ["Connect it first", "Starts GitHub linking when no account is connected."],
      ["How review works", "Explains the automated check and the human verdict."]
    ]
  },
  "/student/debug/*": {
    title: "A debug challenge",
    body: "The brief, the failing behaviour and the submission control for one bounty.",
    flow: [
      "Read the brief and reproduction steps, then open the starter repository.",
      "Fix it in your fork, keeping the change in one commit.",
      "Submit the fork and wait for the automated check to pass."
    ],
    controls: [
      ["Back to debug challenges", "Returns to the bounty list."],
      ["Open starter repository", "Opens the upstream code in a new tab."],
      ["Submit your fork", "Records the fork URL and starts the automated check."],
      ["Automated fork check", "Shows whether the fork exists, is yours and has the commit."]
    ]
  },
  "/student/credentials": {
    title: "Your proof",
    body: "Every credential, badge and event certificate in one ledger, each with its own share control.",
    flow: [
      "Open the record to see what was actually verified and by whom.",
      "Create a signed share link per achievement - it works without a login.",
      "Pending proof is not proof: it only counts once the work merges or a lead confirms."
    ],
    controls: [
      ["Open the record", "Shows the evidence behind one credential."],
      ["Earn the next one", "Points at the shortest route to the next credential."],
      ["Enter a challenge", "Opens the challenges that award proof."],
      ["Archive register", "Lists credentials that are no longer current."]
    ]
  },
  "/student/certificates/*": {
    title: "An event certificate",
    body: "The printable record of attendance for one event, issued at check-in.",
    flow: [
      "Check the name and event on the certificate before printing.",
      "Print or save it as PDF - the page is already signed by the chapter.",
      "No certificate means the door code was never checked in; ask the event lead."
    ],
    controls: [
      ["Print / save PDF", "Opens the browser print dialog with the certificate laid out."],
      ["Verify", "Shows the code anyone can use to confirm the certificate is real."],
      ["Back to events", "Returns to the event list you registered from."]
    ]
  },
  "/student/contests": {
    title: "Contests",
    body: "Time-boxed challenges with registration, a deadline and a submission.",
    flow: [
      "Register before the deadline; the submit control appears only for registrants.",
      "Submit a link to the work; you can replace it until submissions close.",
      "Strong entries can be recognised as signed proof by the chapter."
    ],
    controls: [
      ["See your proof", "Opens the credentials that came out of past contests."],
      ["See Standings", "Shows where the chapter's entries placed."],
      ["Work on a project", "Opens your builds when there is no open contest."]
    ]
  },
  "/student/contests/*": {
    title: "A contest",
    body: "The brief, the clock and your submission for one challenge.",
    flow: [
      "Register first - the submit form only exists for registrants.",
      "Read what this can become before choosing scope; judging follows the brief.",
      "Replace your entry as often as you like until the deadline."
    ],
    controls: [
      ["Register", "Enters you in the contest and starts the clock for you."],
      ["Submit your entry", "Records the link and your description of what you built."],
      ["Open submitted link", "Opens your current submission in a new tab."]
    ]
  },
  "/student/leaderboard": {
    title: "Standings",
    body: "The chapter board, built from verified work rather than logins.",
    flow: [
      "Find your own row first; it is highlighted.",
      "Open a name to see the public proof behind the score.",
      "Read how the score works before chasing a number you cannot influence."
    ],
    controls: [
      ["Find a builder by name or track", "Searches the board instead of scrolling it."],
      ["How the score works", "Expands the scoring rule and what does not count."],
      ["Continue the roadmap", "Returns to the next node on your path."],
      ["Clear search", "Resets the board to every ranked member."]
    ]
  },
  "/student/insights": {
    title: "Your insights",
    body: "Your consistency, roadmap progress and where you stand, read back from recorded work.",
    flow: [
      "Read the summary sentence first - it states what the numbers actually say.",
      "Check the 14-day series for gaps rather than for a peak.",
      "Every figure names where it comes from; open the roadmap to change one."
    ],
    controls: [
      ["Open the roadmap", "Goes to the path the numbers are measured against."],
      ["The last 14 days", "Switches the series to the two-week window."],
      ["Where this comes from", "Lists the tables and jobs behind each number."]
    ]
  },
  "/student/roles": {
    title: "Seats",
    body: "Ask for a Core or Head seat in a department, and see what you already hold.",
    flow: [
      "Pick the department and say why you, in your own words.",
      "Submit; the request notifies the department lead.",
      "Check the term end date before taking a seat on."
    ],
    controls: [
      ["Ask for a seat", "Opens the request form for the department you picked."],
      ["Your requests", "Shows what is pending and what was decided."],
      ["Department", "Chooses which department the request is for."]
    ]
  },
  "/student/mentorship": {
    title: "Mentorship",
    body: "Request a session with a mentor who opted in, and review it afterwards.",
    flow: [
      "Find a mentor by track and availability, then propose a topic and a time.",
      "The mentor confirms; the session appears on both calendars.",
      "Leave a short review so the next student chooses well."
    ],
    controls: [
      ["Open mentorship", "Opens the mentor list from the discovery card."],
      ["What can you teach?", "Opens the form for offering to mentor others."],
      ["Show", "Applies the availability and track filters."],
      ["Clear search", "Resets the mentor list."]
    ]
  },
  "/student/help": {
    title: "Help requests",
    body: "Ask the chapter when you are stuck, with enough detail for someone to answer.",
    flow: [
      "Say what you tried and what happened; a vague ask gets a vague answer.",
      "Watch your own requests until someone replies.",
      "Mark it answered once it is resolved - open requests stay visible."
    ],
    controls: [
      ["Stuck on something?", "Opens the new-request form."],
      ["Your requests", "Lists what you have asked and its state."],
      ["Help others", "Shows open requests from other members."]
    ]
  },
  "/student/community": {
    title: "Community",
    body: "Forums, the chapter wiki and code snippets, in one room.",
    flow: [
      "Use the section links to move between forums, wiki and snippets.",
      "Search before posting; the answer is often already there.",
      "Vote useful answers and flag spam rather than replying to it."
    ],
    controls: [
      ["Ask a question", "Opens a new forum thread."],
      ["Read the wiki", "Opens the chapter's reference pages."],
      ["Flag", "Reports a thread or reply for moderation."],
      ["Solved", "Marks a thread as answered by its author."]
    ]
  },
  "/student/community/forums": {
    title: "Forums",
    body: "Threads from the chapter, with votes and marked solutions.",
    flow: [
      "Filter by recent or top, then search before opening a thread.",
      "Read the marked solution first; it is the answer the author accepted.",
      "Reply in the thread rather than starting a duplicate."
    ],
    controls: [
      ["Start a discussion", "Opens the new-thread form."],
      ["Recent", "Sorts threads by last activity."],
      ["Top", "Sorts threads by votes."],
      ["Filter", "Applies the domain and tag filters."]
    ]
  },
  "/student/community/forums/*": {
    title: "A thread",
    body: "One conversation, its replies and the answer the author accepted.",
    flow: [
      "Read the question and the existing replies before answering.",
      "Add your answer with the detail that made it work for you.",
      "Vote the reply that helped; only the author marks a solution."
    ],
    controls: [
      ["Add your answer", "Posts a reply to this thread."],
      ["Solution", "Marks a reply as the accepted answer (author only)."],
      ["Reply", "Opens the answer box on a specific reply."],
      ["Flag", "Reports the thread or a reply for moderation."]
    ]
  },
  "/student/community/snippets": {
    title: "Code snippets",
    body: "Short, shared pieces of code with language and context.",
    flow: [
      "Filter by language, then search for the problem rather than the syntax.",
      "Open a snippet for its context and the problem it solves.",
      "Share your own with the problem included, not just the code."
    ],
    controls: [
      ["Share a snippet", "Opens the new-snippet form."],
      ["Copy", "Copies the snippet to your clipboard."],
      ["Search snippets", "Matches titles and descriptions."],
      ["Filter by language", "Narrows to one language."]
    ]
  },
  "/student/community/wiki": {
    title: "Chapter wiki",
    body: "The chapter's own reference pages, edited by members and applied by admins.",
    flow: [
      "Search the handbook before writing a new page.",
      "Student edits arrive as suggestions and wait for review.",
      "Admin edits apply directly and bump the version."
    ],
    controls: [
      ["New page", "Opens the page editor with a title, domain and body."],
      ["Search wiki", "Matches page titles and content."],
      ["Copy link", "Copies a stable link to the page you are reading."]
    ]
  },
  "/student/community/wiki/*": {
    title: "A wiki page",
    body: "One reference page, with its version history and an edit control.",
    flow: [
      "Read the page and check its last edit date before trusting a detail.",
      "Improve this page to suggest a correction; it waits for review.",
      "Copy link to cite it in a thread instead of pasting the text."
    ],
    controls: [
      ["Improve this page", "Opens the suggestion editor."],
      ["Copy link to this page", "Copies a stable URL."],
      ["Review state", "Shows whether your suggestion is pending or applied."]
    ]
  },
  "/student/sponsors": {
    title: "Sponsors",
    body: "Who backs the chapter, what they support and the agreements behind it.",
    flow: [
      "Read what each sponsor actually supports before approaching them.",
      "Ask a lead first - sponsorship contact runs through the chapter.",
      "Amounts and pipelines are admin finance data and are not shown here."
    ],
    controls: [
      ["Backing this chapter", "Lists the sponsors and the work they fund."],
      ["No public sponsors yet", "The honest empty state when nothing is published."]
    ]
  },
  "/student/events": {
    title: "Events",
    body: "Workshops, hackathons and talks, with registration and a door code per event.",
    flow: [
      "Filter by domain, then open an event for its venue and time.",
      "Register to get the door code; check-in at the door issues a certificate.",
      "Leave feedback afterwards - it is not attributed publicly."
    ],
    controls: [
      ["Add", "Registers you for the event."],
      ["Check in", "Uses the door code to mark you present."],
      ["View certificate", "Opens the certificate issued at check-in."],
      ["Clear filters", "Resets the domain and status filters."]
    ]
  },
  "/student/events/*": {
    title: "An event",
    body: "The schedule, venue, materials and your registration for one event.",
    flow: [
      "Register, then keep the door code this page shows.",
      "Add it to your calendar so the time is not lost.",
      "Materials are attached by the organiser after the event."
    ],
    controls: [
      ["Add to calendar", "Downloads a calendar file for the event."],
      ["Show this code at the door", "Displays the check-in code for the organiser."],
      ["View certificate", "Opens the certificate once you are checked in."],
      ["Continue the conversation", "Opens the related community thread."]
    ]
  },
  "/student/discover": {
    title: "Discover",
    body: "Trending threads, rising builders and mentors worth knowing in your college.",
    flow: [
      "Open a card to see the public proof behind a person.",
      "Save a builder to review later; the saved list is on this page.",
      "Visibility follows each profile's own setting, so some cards are thinner."
    ],
    controls: [
      ["Search", "Matches builders by name or track."],
      ["Review saved", "Opens the builders you saved for later."],
      ["Open mentorship", "Goes to the mentor list for a deeper conversation."],
      ["Clear", "Resets the discovery filters."]
    ]
  },
  "/student/network": {
    title: "The federation",
    body: "Chapter profiles and federation totals, refreshed by the nightly rollup.",
    flow: [
      "Search for a chapter, or start with your own.",
      "Open a chapter card for its public page and links.",
      "Federation totals move once a day, not live."
    ],
    controls: [
      ["Search chapters", "Matches chapter names and colleges."],
      ["Sort chapters", "Orders by activity or name."],
      ["Reset filters", "Clears the search and the sort."],
      ["Open your chapter", "Opens your own chapter's public page."]
    ]
  },
  "/student/network/*": {
    title: "A chapter",
    body: "One chapter's public profile: mission, links and aggregate activity.",
    flow: [
      "Read the mission and domains to understand what they build.",
      "Open a top contributor to see their public proof.",
      "Chapter events and projects are the honest measure of activity."
    ],
    controls: [
      ["Explore chapter projects", "Shows the work this chapter published."],
      ["View chapter events", "Shows the events they ran."],
      ["Climb your board", "Returns to your own chapter's standings."]
    ]
  },
  "/student/feature-requests": {
    title: "Ideas",
    body: "Suggest and vote on what LOOM builds next; the ledger is shared with admins.",
    flow: [
      "Search before posting - duplicates get merged.",
      "Describe the problem, the trade-offs and how you would know it worked.",
      "Vote once per idea; the ledger's status is set by admins."
    ],
    controls: [
      ["What should LOOM build next?", "Opens the new-idea form."],
      ["Integration", "Explains how the idea fits existing features."],
      ["Trade-offs", "Records what the idea costs or gives up."],
      ["Implementation", "Describes how it would actually be built."]
    ]
  },
  "/student/notifications": {
    title: "Inbox",
    body: "Every notification, newest first, with the one link it is about.",
    flow: [
      "Open one to mark it read and clear the matching nav dot.",
      "Follow its link to the thing that changed.",
      "The bell in the top bar carries the unread count."
    ],
    controls: [
      ["Notification views", "Filters to unread or a single kind of notification."]
    ]
  },
  "/student/settings": {
    title: "Settings",
    body: "Your profile, handle, theme, privacy controls and the walkthrough replay.",
    flow: [
      "Edit the profile fields first; they are what leads and the public card read.",
      "Changing track keeps completed roadmap nodes.",
      "Usage analytics can be switched off here; opted-out accounts write no rows."
    ],
    controls: [
      ["View public card", "Opens the card other people see."],
      ["Edit card", "Opens the public-card editor."],
      ["Claim username", "Reserves the handle used in your profile URL."],
      ["Close my account", "Starts the irreversible closure flow."],
      ["Sign out", "Ends this session on this device."]
    ]
  },
  "/student/privacy": {
    title: "Privacy",
    body: "What this app stores, what it never stores, and the controls you own.",
    flow: [
      "Read what is collected before changing a control - some actions cannot be undone.",
      "Usage analytics is aggregate and first-party; no third-party scripts run here.",
      "Export or close your account from this page."
    ],
    controls: [
      ["Close my account", "Starts the closure flow with its confirmation text."],
      ["Keep my account", "Cancels the closure and returns to the page."],
      ["Sign out", "Ends this session on this device."]
    ]
  },

  /* ------------------------------------------------------------------- lead */
  "/lead/overview": {
    title: "Your console",
    body: "Roster health, contribution output and the decisions that need a lead, in one read.",
    flow: [
      "Start with the queue: it is ordered by what needs a person first.",
      "Open a card to reach the section that owns the number.",
      "Refresh after acting; the live feed shows what just happened."
    ],
    controls: [
      ["Refresh", "Reloads the console data for your scope."],
      ["Rules of engagement", "Expands what a lead decides and what escalates."],
      ["Approve", "Approves a queued item in place."],
      ["Send back", "Returns an item with a note instead of deciding it."]
    ]
  },
  "/lead/departments": {
    title: "Departments",
    body: "The department workspaces you can see, with their roster size and current head.",
    flow: [
      "Open a department for its roster, work board and monthly report.",
      "A Head sees their own department; a Vertical Lead sees the whole vertical.",
      "A department with no live head says so rather than hiding."
    ],
    controls: [
      ["Nothing here yet", "The honest empty state when your scope has no departments."],
      ["Technical", "Filters the list to technical departments."],
      ["Non-technical", "Filters the list to non-technical departments."]
    ]
  },
  "/lead/departments/*": {
    title: "A department",
    body: "One department's roster, work and report, scoped to what your role can edit.",
    flow: [
      "Read who leads it and whether the seat is live.",
      "Work the board: assign a task, set a deadline, then verify the submission.",
      "Compile the monthly report here, read it, then submit it."
    ],
    controls: [
      ["Members", "Lists the roster with levels and seats."],
      ["Event operations", "Opens the task board for this department's events."],
      ["Reports", "Shows the monthly report for this department."],
      ["Contributions", "Lists verified contribution in the ledger."]
    ]
  },
  "/lead/roster": {
    title: "Roster",
    body: "Every member in your scope, their level, and the Core requests you can act on.",
    flow: [
      "Search or filter to the person, then open their record.",
      "Approve a Core request with the scope shown, or send it back with a reason.",
      "Role changes above Core belong to admins, not this page."
    ],
    controls: [
      ["Search roster", "Filters by name, year or GitHub handle."],
      ["Filter roster by level", "Narrows to core, head or member."],
      ["Approve", "Grants the request at the scope displayed."],
      ["Send back", "Declines the request and tells the member why."]
    ]
  },
  "/lead/members/*": {
    title: "A member",
    body: "One person's seats, contributions and work inside your scope.",
    flow: [
      "Read their seats and term dates before acting on anything.",
      "Verified roadmap nodes, projects and merges are what count as contribution.",
      "Anything outside your scope is absent, not forbidden."
    ],
    controls: [
      ["Public profile", "Opens the card other members see."],
      ["Roadmap nodes", "Lists the nodes they have verified."],
      ["Projects", "Lists the builds they shipped."],
      ["Seats", "Shows current seats and when each term ends."]
    ]
  },
  "/lead/events": {
    title: "Events",
    body: "Every chapter event you can edit, with its date, capacity and turnout state.",
    flow: [
      "Filter by status to find what is still open for registration.",
      "Open an event to edit it, run check-in or read feedback.",
      "Create event schedules a new one with capacity and materials."
    ],
    controls: [
      ["Create event", "Opens the event form with capacity, venue and materials."],
      ["Search title or description", "Finds an event without scrolling the list."],
      ["All statuses", "Filters to published, live, completed or cancelled."],
      ["Clear", "Resets the search and status filters."]
    ]
  },
  "/lead/events/new": {
    title: "Create an event",
    body: "Schedule a workshop, hackathon, talk or contest with a real capacity.",
    flow: [
      "Fill the event details: title, kind, venue and time.",
      "Set a capacity - it drives seat fill and the waitlist on the student side.",
      "Check the planner for clashes before you publish."
    ],
    controls: [
      ["Create an event", "Publishes the event to the chapter."],
      ["Event details", "The title, kind, venue and timing fields."],
      ["What happens after you post", "Explains registration, check-in and certificates."]
    ]
  },
  "/lead/events/*": {
    title: "An event",
    body: "The event's tasks, registrations, door check-in and feedback in one place.",
    flow: [
      "Assign the run-up tasks with owners and deadlines.",
      "Run door check-in on the day; attendance issues certificates.",
      "Read the feedback average after the event closes."
    ],
    controls: [
      ["Assign an owner", "Gives a task to a member with a deadline."],
      ["Door check-in", "Marks an attendee present with their code."],
      ["Download attendee CSV", "Exports the attendee ledger."],
      ["Announce it", "Publishes to the chapter feed or one vertical."]
    ]
  },
  "/lead/workshops": {
    title: "Workshops",
    body: "Upcoming seat fill and how many people actually showed up last time.",
    flow: [
      "Read seat fill first; a workshop below capacity is worth rescheduling.",
      "Turnout comes from check-ins, not registrations.",
      "Open the event to change capacity or cancel it."
    ],
    controls: [
      ["Create event", "Schedules another workshop."],
      ["Open event", "Opens the event's operations page."],
      ["Clear", "Resets the workshop filters."]
    ]
  },
  "/lead/event-ops": {
    title: "Event operations",
    body: "Tasks and deadlines for the events you own, across the run-up and the day itself.",
    flow: [
      "Overdue tasks are surfaced first.",
      "Assign an owner and a deadline for anything unclaimed.",
      "Completing a task notifies the owner; it does not close the event."
    ],
    controls: [
      ["Task board", "Shows every task across your events."],
      ["Assign an owner", "Gives a task to a member."],
      ["Download attendee CSV", "Exports the attendee ledger for an event."]
    ]
  },
  "/lead/challenges": {
    title: "Challenges",
    body: "Chapter challenges with their registration and submission counts.",
    flow: [
      "Open a challenge to read its brief and manage the deadline.",
      "A low submission rate is a brief problem before it is a student problem.",
      "CSV exports the counts if you need them outside the console."
    ],
    controls: [
      ["Open a challenge", "Shows the brief and its counts."],
      ["CSV", "Downloads the challenge list and counts."],
      ["Who can do what", "Explains what a lead may change versus an admin."]
    ]
  },
  "/lead/practice": {
    title: "Practice room",
    body: "The weekly seven, this week's assignments and any corrections you owe.",
    flow: [
      "Assign the week before it starts; students see the same set.",
      "Review corrections before they affect the board.",
      "Check sync health if members' practice handles are not resolving."
    ],
    controls: [
      ["Weekly assignments", "Shows what is set for the current week."],
      ["Recent corrections", "Lists corrections waiting for review."],
      ["Sync health", "Shows the last practice sync and its failures."],
      ["Members", "Lists members and their practice handles."]
    ]
  },
  "/lead/debug": {
    title: "Debug queue",
    body: "Verified forks waiting for a human review, newest first.",
    flow: [
      "The automated check has already confirmed the fork; you judge the fix.",
      "Open the fork, read the diff, then approve or reject with a reason.",
      "Approving awards the bounty and notifies the student."
    ],
    controls: [
      ["Open the fork", "Opens the submitted fork in a new tab."],
      ["Approved in your domain", "Lists fixes you already approved."],
      ["Debug queue", "Shows submissions still waiting on a person."]
    ]
  },
  "/lead/planner": {
    title: "Planner",
    body: "The shared society calendar, where sessions and deadlines are laid out for the cohort.",
    flow: [
      "Add a session with its agenda, owner and material.",
      "Students see the same calendar on their Planner page.",
      "Check for clashes before adding anything to a busy week."
    ],
    controls: [
      ["Shared calendar", "Shows every session in the term."],
      ["Session ownership", "Shows who owns each session, and lets a departing holder hand it over."],
      ["Filter by wing", "Narrows the calendar to one wing."],
      ["Export .ics", "Downloads the calendar for another app."]
    ]
  },
  "/lead/reports": {
    title: "Reports",
    body: "Monthly department reports, the contribution ledger and the calendar.",
    flow: [
      "Compile the month, read it, then submit - a submitted report is locked.",
      "The contribution ledger is the evidence behind the numbers.",
      "An admin can reopen a submitted report; you cannot reopen your own."
    ],
    controls: [
      ["Monthly report", "Opens this month's draft or the submitted version."],
      ["Recently logged", "Shows the newest contribution entries."],
      ["Calendar", "Shows the scheduling conflicts for the month."],
      ["Approve", "Approves a contribution entry in the ledger."]
    ]
  },
  "/lead/analytics": {
    title: "Usage",
    body: "Where the chapter actually goes: route traffic, tour drop-off and destinations nobody finds.",
    flow: [
      "Read the journey figures first: views, visitors per active day, signed-in share.",
      "Check the tour funnels to see where a walkthrough loses people.",
      "Hard-to-reach routes are the ones worth a link from somewhere visible."
    ],
    controls: [
      ["Usage", "The section itself: routes, funnels and destinations."],
      ["Refresh", "Reloads the report from the nightly aggregates."],
      ["Rules of engagement", "Explains what the numbers do and do not include."]
    ]
  },
  "/lead/succession": {
    title: "Succession",
    body: "Who is ready to carry a department forward when a term ends.",
    flow: [
      "Read the readiness signals: verified nodes, merges, projects, solutions.",
      "Propose a successor with a short brief, or send the suggestion back.",
      "A handover is approved by an admin, never by the person leaving."
    ],
    controls: [
      ["Approve", "Approves a flagged successor."],
      ["Send back", "Returns the suggestion with a note."],
      ["Vertical signals", "Shows readiness across your whole vertical."]
    ]
  },
  "/lead/assets": {
    title: "Assets",
    body: "The shared creative shelf: logos, templates and decks, with versions.",
    flow: [
      "Download the current version; old versions stay available.",
      "Upload a new version instead of replacing the file, so links keep working.",
      "Keep uploads inside the seeded categories."
    ],
    controls: [
      ["The shelf", "Lists every asset and its current version."],
      ["Download", "Fetches the current file through a signed URL."],
      ["Upload", "Adds a new version to an existing asset."]
    ]
  },
  "/lead/directory": {
    title: "Directory",
    body: "Leads and heads, current and past, with their departments and terms.",
    flow: [
      "Search by name, department or vertical.",
      "An ended term shows history without authority.",
      "Contact details follow each person's own visibility settings."
    ],
    controls: [
      ["The directory", "Lists current and past leadership."],
      ["Search", "Matches names, departments and verticals."]
    ]
  },
  "/lead/mous": {
    title: "MoUs",
    body: "Chapter agreements with their partners, renewal dates and expiry state.",
    flow: [
      "Read the renewal date before acting; expired agreements are marked.",
      "Attach the signed document to the agreement, not to a message.",
      "Expiring agreements surface in the lead reminders."
    ],
    controls: [
      ["Agreement ledger", "Lists every agreement and its state."],
      ["Download", "Fetches the signed document."],
      ["Upload", "Attaches a new version of the document."]
    ]
  },
  "/lead/announcements": {
    title: "Announcements",
    body: "Compose and publish a chapter announcement, or keep it as a draft.",
    flow: [
      "Write the announcement and choose who it targets.",
      "A draft is private until published.",
      "Publishing notifies the targeted members once."
    ],
    controls: [
      ["Composer", "The announcement body and targeting fields."],
      ["Publish", "Sends the announcement and notifies recipients."],
      ["Draft", "Saves it without notifying anyone."]
    ]
  },

  /* ------------------------------------------------------------------ admin */
  "/admin": {
    title: "Chapter overview",
    body: "Chapter totals, the attention queue and the latest admin actions on one desk.",
    flow: [
      "Work the attention queue first; it holds what needs a human today.",
      "Open a card to reach the screen that owns the number.",
      "The trail at the bottom is the newest entries from the audit log."
    ],
    controls: [
      ["Attention queue", "Lists items waiting on an admin decision."],
      ["Create event", "Schedules a gathering from the calendar card."],
      ["Create department", "Adds a department with its vertical and head."],
      ["Full log", "Opens the audit log for the full history."]
    ]
  },
  "/admin/students": {
    title: "Students",
    body: "The roster with role, department and onboarding state.",
    flow: [
      "Search or filter to the person, then open their record.",
      "Role changes need a scope and a term end date.",
      "Bulk assign changes several students at once - read the confirmation before you confirm."
    ],
    controls: [
      ["Select all on this page", "Marks every visible student for a batch change."],
      ["Bulk assign", "Opens the batch role and department panel."],
      ["Confirm batch change", "Applies the change to every selected student."],
      ["New role", "Sets the role the batch will apply."]
    ]
  },
  "/admin/students/*": {
    title: "A student",
    body: "One member's record: seats, contributions, proof and role controls.",
    flow: [
      "Read the account status before changing anything.",
      "Role management needs a scope and a term end date; it applies immediately.",
      "Suspending or closing an account is reversible only by an admin, and audited."
    ],
    controls: [
      ["Role management", "Opens the role and department form for this member."],
      ["Suspend", "Blocks access without erasing the record."],
      ["Reactivate", "Restores a suspended account."],
      ["Close account", "Starts the irreversible closure flow."]
    ]
  },
  "/admin/mentors": {
    title: "Mentors",
    body: "Who mentors, when they are available and which sessions they have taken.",
    flow: [
      "Add a mentor from the roster, then set availability.",
      "Review applications before they become mentors.",
      "Effectiveness comes from completed sessions, not requests."
    ],
    controls: [
      ["Find students", "Searches the roster for someone to add as a mentor."],
      ["Needs review", "Filters to mentor applications awaiting a decision."],
      ["Approve", "Accepts an application and makes the mentor visible."],
      ["Declines notify the applicant", "A decline is recorded with a reason."]
    ]
  },
  "/admin/departments": {
    title: "Departments",
    body: "Create, rename and archive departments, and see their current heads.",
    flow: [
      "Create the department with its vertical; the slug is derived from the name if blank.",
      "A department needs a live head before it can carry work.",
      "Archiving keeps history and does not delete members."
    ],
    controls: [
      ["Create department", "Adds the department and its first head."],
      ["Active immediately", "Makes the department visible as soon as it is created."],
      ["Vertical", "Chooses technical or non-technical."]
    ]
  },
  "/admin/requests": {
    title: "Seat requests",
    body: "Core and Head requests waiting on a decision.",
    flow: [
      "Read the requester's verified proof and chapter position, not their pitch alone.",
      "Approve with a scope and term end date, or decline with a reason.",
      "The requester is notified either way."
    ],
    controls: [
      ["Waiting on a decision", "Lists the requests still open."],
      ["Approve", "Grants the seat at the scope shown."],
      ["Reject", "Declines with a reason the requester can act on."],
      ["Recently decided", "Shows what was decided and by whom."]
    ]
  },
  "/admin/roadmaps": {
    title: "Roadmaps",
    body: "Publish paths and nodes, set difficulty and decide what a node requires.",
    flow: [
      "Filter to a domain, then add or edit a node.",
      "A required evidence type blocks completion until it is attached.",
      "Publishing changes what every student on that track sees."
    ],
    controls: [
      ["Add a node", "Opens the node form with resources and requirements."],
      ["Filter by domain", "Narrows the catalogue to one track."],
      ["Search roadmap nodes", "Matches titles and descriptions."],
      ["Manage resources", "Opens the library to attach material."]
    ]
  },
  "/admin/resources": {
    title: "Resources",
    body: "Curate the library per track, level and kind.",
    flow: [
      "Filter by domain and kind, then open a resource to edit it.",
      "Resources attached to a node appear in that node's shelf.",
      "Retiring a resource keeps existing completions intact."
    ],
    controls: [
      ["All domains", "Filters the library to one track."],
      ["All kinds", "Filters to article, video or doc."],
      ["Open", "Opens a resource for editing."],
      ["Clear", "Resets every filter."]
    ]
  },
  "/admin/opensource": {
    title: "Open source console",
    body: "Tracked repositories, their live GitHub metadata and the claims on them.",
    flow: [
      "Curate a repository once, then let the sync keep its metadata current.",
      "Verify or reject a claimed contribution; merged PRs verify automatically.",
      "The link must match both the repository and the claim before you confirm."
    ],
    controls: [
      ["Curate a new repo", "Adds a repository with difficulty and domain."],
      ["Search", "Matches repositories and claims."],
      ["Beginner", "Filters by difficulty tier."],
      ["Clear", "Resets the filters."]
    ]
  },
  "/admin/community": {
    title: "Community moderation",
    body: "Flagged threads, replies and the wiki suggestion queue.",
    flow: [
      "Work the flagged queues first; hiding removes content from student views.",
      "Reviewing a wiki suggestion applies it and bumps the version.",
      "Nothing is deleted - hidden content stays for audit."
    ],
    controls: [
      ["Flagged threads", "Lists reported threads with their reason."],
      ["Wiki review queue", "Shows suggestions waiting to be applied."],
      ["Pinned", "Marks a thread as pinned for the forum."],
      ["Hidden content", "Lists what is currently hidden from members."]
    ]
  },
  "/admin/contests": {
    title: "Contests",
    body: "Create and run challenges: registrations, submissions and judging.",
    flow: [
      "A contest needs a deadline before it can accept submissions.",
      "Move it from draft to published, then open when the clock starts.",
      "Recognising an entry issues proof to the student."
    ],
    controls: [
      ["All statuses", "Filters to draft, published, open, active or closed."],
      ["Filter", "Applies the status filter."],
      ["Previous", "Pages back through the contest list."],
      ["Next", "Pages forward through the contest list."]
    ]
  },
  "/admin/practice": {
    title: "Practice room",
    body: "The weekly seven, corrections and the practice board's inputs.",
    flow: [
      "Publish the week before it starts; the set is shared by the whole chapter.",
      "Review corrections before approving - they change what the board counts.",
      "Check sync health if members' practice handles stop resolving."
    ],
    controls: [
      ["Weekly assignments", "Shows the set for the current week."],
      ["Corrections", "Lists corrections waiting for review."],
      ["View evidence", "Opens the evidence behind a recorded solve."],
      ["Sync health", "Shows the last sync run and its failures."]
    ]
  },
  "/admin/debug": {
    title: "Debug and build",
    body: "Author and publish debug challenges, then review verified forks.",
    flow: [
      "Publish a challenge with its brief and starter repository.",
      "Review submissions per domain; the automated check is not the verdict.",
      "Approving awards the bounty and notifies the student."
    ],
    controls: [
      ["Challenge catalogue", "Lists every published debug challenge."],
      ["Submissions", "Shows forks waiting for a human review."],
      ["Approve", "Closes the bounty and awards it to the author."]
    ]
  },
  "/admin/events": {
    title: "Events console",
    body: "Every chapter event, its capacity, registrations and check-in state.",
    flow: [
      "Filter by status to find what is live or still open.",
      "Check in by door code; attendance issues certificates.",
      "Read feedback averages after the event closes."
    ],
    controls: [
      ["All statuses", "Filters to published, live, completed or cancelled."],
      ["Workshop", "Sets the kind of event being created."],
      ["Society-wide", "Makes the event visible to the whole chapter."],
      ["Create event", "Publishes a new event."]
    ]
  },
  "/admin/events/*": {
    title: "An event",
    body: "One event's tasks, registrations, volunteers and attendance.",
    flow: [
      "Assign run-up tasks with owners and deadlines.",
      "Run door check-in on the day; the ledger updates as people arrive.",
      "Export the attendee CSV for records outside LOOM."
    ],
    controls: [
      ["Door check-in", "Marks an attendee present with their code."],
      ["Attendee ledger", "Lists registrations and who arrived."],
      ["Volunteer roster", "Shows who is working the event."],
      ["Download attendee CSV", "Exports the ledger."]
    ]
  },
  "/admin/planner": {
    title: "Planner",
    body: "The collective 28-week calendar for the chapter and its sessions.",
    flow: [
      "Sessions added here appear on every student's planner.",
      "Curriculum sessions are seeded; add the ones the chapter actually runs.",
      "The planner is a switchable feature: a disabled planner says so instead of hiding."
    ],
    controls: [
      ["Events console", "Opens the events list for the same term."],
      ["Relaxation", "Records a week that is deliberately lighter."],
      ["Exam protection", "Blocks sessions during exams."],
      ["Ops notes", "Records what changed and why."]
    ]
  },
  "/admin/projects": {
    title: "Projects",
    body: "Student builds with their repository, tags and review state.",
    flow: [
      "Filter by status, then open a project to read its summary and commits.",
      "Recognising a project is a proof decision, not a content edit.",
      "Rejected projects keep their history and can be resubmitted."
    ],
    controls: [
      ["All statuses", "Filters to active, in review, completed, rejected or archived."],
      ["Filter", "Applies the status filter."],
      ["Open", "Opens the project record."],
      ["Clear", "Resets the filters."]
    ]
  },
  "/admin/assets": {
    title: "Creative assets",
    body: "The shared shelf of logos, templates and decks, with version history.",
    flow: [
      "Upload a new version instead of replacing the file.",
      "Categories are seeded; keep new uploads inside them.",
      "Downloads go through signed URLs, so links are short-lived."
    ],
    controls: [
      ["The shelf", "Lists every asset and its current version."],
      ["Upload", "Adds a new version to an asset."],
      ["Download", "Fetches the current file."]
    ]
  },
  "/admin/mous": {
    title: "MoUs",
    body: "Agreements with partners, their renewal dates and expiry state.",
    flow: [
      "Read the renewal date before acting; expired agreements are marked.",
      "Attach the signed document to the agreement record.",
      "Expiring agreements are surfaced before they lapse."
    ],
    controls: [
      ["Agreement ledger", "Lists every agreement and its state."],
      ["Download", "Fetches the signed document."],
      ["Upload", "Attaches a new version."]
    ]
  },
  "/admin/directory": {
    title: "Leadership directory",
    body: "Every lead and head, current and past, with term dates.",
    flow: [
      "Search by name, department or vertical.",
      "An ended term keeps the title for history and removes authority.",
      "Reappoint from the student's record, not from here."
    ],
    controls: [
      ["The directory", "Lists current and past leadership."],
      ["Search", "Matches names, departments and verticals."]
    ]
  },
  "/admin/event-ops": {
    title: "Event operations",
    body: "The task board behind every event, with owners and deadlines.",
    flow: [
      "Overdue tasks surface first.",
      "Assign an owner and a deadline for anything unclaimed.",
      "Completing a task notifies its owner."
    ],
    controls: [
      ["Task board", "Shows every task across the chapter's events."],
      ["Assign an owner", "Gives a task to a member."],
      ["Download attendee CSV", "Exports the attendee ledger for an event."]
    ]
  },
  "/admin/announcements": {
    title: "Announcements",
    body: "Compose, draft and publish chapter announcements.",
    flow: [
      "Write the announcement and choose who it targets.",
      "Drafts stay private until published.",
      "Publishing notifies the targeted members once."
    ],
    controls: [
      ["Composer", "The announcement body and targeting fields."],
      ["Publish", "Sends it and notifies recipients."],
      ["Draft", "Saves it without notifying anyone."]
    ]
  },
  "/admin/verification": {
    title: "Verification console",
    body: "Skill badges, achievements awaiting review and the live share links.",
    flow: [
      "Define a badge and its tiers before issuing anything.",
      "Review the manual achievements that need a human decision.",
      "Issuing an achievement notifies the student and becomes shareable."
    ],
    controls: [
      ["Define a badge", "Creates the badge name, description and tier."],
      ["Manual achievement", "Records proof that no automated check covers."],
      ["Tier", "Sets bronze, silver or gold for the badge."],
      ["Level", "Sets the student level the badge is issued at."]
    ]
  },
  "/admin/ranking": {
    title: "Evidence review",
    body: "Claimed evidence waiting for a human to confirm it.",
    flow: [
      "Confirm the claim against the linked artefact, not the summary.",
      "A rejection needs a reason the student can act on.",
      "Reviewed items leave the queue; the decision is audited."
    ],
    controls: [
      ["Review queue", "Lists claims waiting for a reviewer."],
      ["What you are confirming", "Explains what the decision actually records."],
      ["Approve", "Confirms the evidence and credits it."]
    ]
  },
  "/admin/analytics": {
    title: "Chapter analytics",
    body: "Cohort health, funnels, mentor effectiveness and where usage actually goes.",
    flow: [
      "Read each section's denominator before its percentage.",
      "The usage sections read the nightly rollup, so they lag by a day.",
      "Bottleneck details explain a drop instead of just showing it."
    ],
    controls: [
      ["Chapter analytics", "The cohort sections and their denominators."],
      ["Bottleneck details", "Explains where a funnel loses people."],
      ["Mentor effectiveness", "Completed sessions against requests."],
      ["Detail ledger", "Lists the rows behind the summary numbers."]
    ]
  },
  "/admin/finance": {
    title: "Finance",
    body: "Budget heads, proposed expenses and the sponsorship pipeline.",
    flow: [
      "A Vertical Lead can propose an expense but never approve one.",
      "Approving changes the remaining balance immediately.",
      "Mark paid once the transfer has actually happened."
    ],
    controls: [
      ["Approve", "Approves an expense and reduces the remaining balance."],
      ["Reject", "Declines an expense with a reason."],
      ["Mark paid", "Records that the money left the account."],
      ["Allocated", "Sets how much of a budget head an expense uses."]
    ]
  },
  "/admin/reports": {
    title: "Department reports",
    body: "Submitted monthly reports and the semester or annual export.",
    flow: [
      "Only submitted reports are exported.",
      "Pick the period, then the format: JSON, CSV or PDF.",
      "Reopening a report is an admin action and is audited."
    ],
    controls: [
      ["Semester", "Sets the export period to the semester."],
      ["Annual", "Sets the export period to the year."],
      ["All departments", "Filters the export to one department."],
      ["JSON", "Downloads the bundle in the chosen format."]
    ]
  },
  "/admin/settings": {
    title: "Settings",
    body: "Chapter identity, public card and the configuration other screens read.",
    flow: [
      "Set the public name and slug first - they drive the chapter's public page.",
      "Changes here are visible to every member immediately.",
      "Integration switches live here; flags control what members see."
    ],
    controls: [
      ["Tenant identity", "The chapter's name, slug and public details."],
      ["Integrations", "The connection state for GitHub and the webhook."],
      ["Flags", "Opens the chapter-level feature switches."]
    ]
  },
  "/admin/handover": {
    title: "Handover",
    body: "Leadership terms ending soon and the queue for guided seat transfers.",
    flow: [
      "Read the outgoing brief before approving a transfer.",
      "You cannot approve your own handover.",
      "The transfer checklist is the record that the seat changed hands."
    ],
    controls: [
      ["Approve", "Approves a seat handover."],
      ["Terms ending soon", "Lists seats whose term is nearly over."],
      ["Transfer checklist", "Shows what is outstanding before a seat moves."],
      ["Outstanding succession items", "Lists what still blocks a handover."]
    ]
  },
  "/admin/flags": {
    title: "Feature flags",
    body: "Chapter-level switches for features that are built but not yet on everywhere.",
    flow: [
      "A flag changes what this chapter sees, not the code.",
      "Off is the default: switch something on only when the chapter can support it.",
      "Operator-only flags are read-only here and say so."
    ],
    controls: [
      ["Operator-only", "Marks a flag only a platform admin can change."],
      ["Feature flags", "Lists every flag with its current state."],
      ["Chapter controls", "Explains what a chapter may switch on."]
    ]
  },
  "/admin/faq": {
    title: "FAQ",
    body: "The public questions the site answers, and the answers themselves.",
    flow: [
      "Search for the question before adding a duplicate.",
      "Publish to the public FAQ, or keep the row unpublished.",
      "Unpublish rather than delete when a question stops applying."
    ],
    controls: [
      ["Publish", "Makes the question visible on the public page."],
      ["Unpublish", "Removes it from the public page and keeps the row."],
      ["Search FAQ", "Matches questions and slugs."],
      ["Sort order", "Sets where the question appears in the list."]
    ]
  },
  "/admin/audit": {
    title: "Audit log",
    body: "Every admin action with its before and after, newest first.",
    flow: [
      "Filter by actor, action or resource before scrolling.",
      "Open a row to see the before and after values.",
      "The log is append-only; it is the chapter's memory."
    ],
    controls: [
      ["Search audit log", "Matches action, resource or actor."],
      ["Filter", "Applies the action and resource filters."],
      ["Clear", "Removes every filter."],
      ["Previous", "Pages back through older entries."]
    ]
  },
  "/admin/feature-requests": {
    title: "Feature requests",
    body: "The idea ledger, with votes and the state each request is in.",
    flow: [
      "Merge duplicates so votes land in one place.",
      "A status change is visible to the member who asked.",
      "Create a GitHub issue when the idea is ready to be built."
    ],
    controls: [
      ["Create GitHub issue", "Opens an issue from the request."],
      ["Refresh", "Reloads the ledger from the database."],
      ["Ask", "Posts a counter-question on the request."],
      ["Let them build", "Moves the request to the building state."]
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

function describe(key, entry, path, tourState) {
  const version = Number(entry.version) || PAGE_GUIDE_VERSION;
  const raw = tourState && typeof tourState === "object" ? tourState[`guide-${slugFor(key)}`] : null;
  return {
    id: `guide-${slugFor(key)}`,
    key,
    path,
    version,
    title: entry.title,
    body: entry.body,
    flow: entry.flow || [],
    controls: entry.controls || [],
    seen: Number(raw) >= version
  };
}

/**
 * Resolve the guide for a pathname: exact route, then the longest `*` family,
 * then the member-profile pattern, then the workspace default. Returns null
 * outside the three private workspaces.
 */
export function guideForPath(pathname, tourState = null) {
  const path = normalizePath(pathname || "/");

  if (PAGE_GUIDES[path]) return describe(path, PAGE_GUIDES[path], path, tourState);

  let best = null;
  for (const [key, value] of Object.entries(PAGE_GUIDES)) {
    if (!key.endsWith("/*")) continue;
    const prefix = key.slice(0, -1);
    if (!path.startsWith(prefix) || path.length <= prefix.length) continue;
    if (!best || key.length > best.key.length) best = { key, value };
  }
  if (best) return describe(best.key, best.value, path, tourState);

  for (const rule of PATTERN_GUIDES) {
    if (rule.pattern.test(path)) return describe(rule.key, rule, path, tourState);
  }

  const area = path.split("/")[1];
  const fallback = AREA_GUIDES[area];
  if (!fallback) return null;
  return describe(`/${area}`, fallback, path, tourState);
}

/** localStorage mirror key; the profile's tour_state is the cross-device copy. */
export function guideStorageKey(userId, guide) {
  return `loom-guide:${userId || "anon"}:${guide.id}:${guide.version}`;
}
