/**
 * Insight engine — reads numbers that already exist and says what they mean.
 *
 * This module is pure: no database, no clock, no network. It takes a plain
 * metrics object and returns at most a handful of cards, each one traceable to
 * a number the reader can check on the page it links to. That constraint is the
 * whole design: an insight that cannot point at its own evidence is not an
 * insight, it is a horoscope, and this chapter already has enough dashboards
 * that show totals nobody acts on.
 *
 * Different levels get different questions answered:
 *
 *   student  — is my week actually moving, and what is the one next step?
 *   core     — is anyone blocked on me, and is my seat doing its job?
 *   lead     — what in my scope is late, unowned, or waiting on a decision?
 *   admin    — is the chapter healthier this week than last, and where does it stall?
 *
 * The same card shape is rendered everywhere (`InsightCards`), so a lead and an
 * admin read the same visual language even though the questions differ.
 */

export const INSIGHT_TONES = Object.freeze(["risk", "watch", "next", "win"]);

/** The word shown on the card. Tone is never carried by colour alone. */
export const INSIGHT_TONE_LABEL = Object.freeze({
  risk: "Needs attention",
  watch: "Watch",
  next: "Next move",
  win: "Working"
});

const TONE_RANK = Object.freeze({ risk: 0, watch: 1, next: 2, win: 3 });

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function int(value) {
  return Math.round(num(value));
}

/** "1 task" / "3 tasks" — pluralisation is a correctness detail, not a nicety. */
export function plural(count, one, many = `${one}s`) {
  return int(count) === 1 ? one : many;
}

function card({ id, tone, title, body, metric = null, action = null, weight = 0 }) {
  return { id, tone, title, body, metric, action, weight };
}

function daysText(days) {
  const n = int(days);
  if (n <= 0) return "today";
  return n === 1 ? "1 day" : `${n} days`;
}

/**
 * Risk first, then watch, then the next move, then what is working. Within a
 * tone the bigger number wins, because "6 overdue" outranks "1 overdue" even
 * when both are urgent.
 */
export function rankInsights(insights = []) {
  return (insights || [])
    .filter(Boolean)
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        (TONE_RANK[a.item.tone] ?? 9) - (TONE_RANK[b.item.tone] ?? 9) ||
        num(b.item.weight) - num(a.item.weight) ||
        a.index - b.index
    )
    .map((row) => row.item);
}

export function topInsights(insights = [], limit = 6) {
  return rankInsights(insights).slice(0, Math.max(0, int(limit) || 0));
}

/**
 * One member's reading.
 *
 * Every field is optional. A metric that is missing produces no card, so a
 * brand-new account gets an honest empty state instead of a fabricated
 * "you're doing great". `null` is meaningful: `daysSinceActive: null` means no
 * activity was ever recorded, which is different from zero days.
 *
 * @param {object} m
 * @param {number} [m.roadmapPct]          completed nodes / total nodes, 0-100
 * @param {number} [m.nodesTotal]          nodes that actually exist in the catalogue
 * @param {number} [m.provisionalNodes]    completed but not yet verified
 * @param {number|null} [m.daysSinceActive]
 * @param {number} [m.consistency]         percent of the last 30 days with activity
 * @param {number} [m.peerConsistency]     chapter average for the same window
 * @param {number} [m.peerCount]           how many peers the average is built from
 * @param {number} [m.ossVerified]         verified open-source contributions
 * @param {number} [m.overdueWork]         my department + event tasks past due
 * @param {number} [m.blockedWork]         my department tasks flagged blocked
 * @param {number} [m.submittedWork]       my submissions waiting on a reviewer
 * @param {number} [m.eventsRegistered]
 * @param {number} [m.eventsAttended]
 * @param {number} [m.practiceTotal]       problems in the open practice week
 * @param {number} [m.practiceSolved]
 * @param {number} [m.mentees]
 * @param {number} [m.mentorSessions]
 * @param {string[]} [m.coreSeats]         department names where the member holds Core
 * @param {number} [m.reviewQueue]         submissions in those departments awaiting a reviewer
 * @param {number} [m.ledDepartments]      departments where the member holds Head
 */
export function studentInsights(m = {}) {
  const out = [];

  const overdueWork = int(m.overdueWork);
  const blockedWork = int(m.blockedWork);
  const submittedWork = int(m.submittedWork);
  const nodesTotal = int(m.nodesTotal);
  const roadmapPct = Math.max(0, Math.min(100, int(m.roadmapPct)));
  const provisionalNodes = int(m.provisionalNodes);
  const consistency = int(m.consistency);
  const consistencyKnown = m.consistency !== null && m.consistency !== undefined;
  const peerConsistency = int(m.peerConsistency);
  const peerCount = int(m.peerCount);
  const ossVerified = int(m.ossVerified);
  const eventsRegistered = int(m.eventsRegistered);
  const eventsAttended = int(m.eventsAttended);
  const practiceTotal = int(m.practiceTotal);
  const practiceSolved = int(m.practiceSolved);
  const mentees = int(m.mentees);
  const mentorSessions = int(m.mentorSessions);
  const reviewQueue = int(m.reviewQueue);
  const ledDepartments = int(m.ledDepartments);
  const coreSeats = Array.isArray(m.coreSeats) ? m.coreSeats.filter(Boolean) : [];
  const daysSinceActive = m.daysSinceActive === null || m.daysSinceActive === undefined
    ? null
    : Math.max(0, int(m.daysSinceActive));

  if (overdueWork > 0) {
    out.push(card({
      id: "work-overdue",
      tone: "risk",
      title: `${overdueWork} ${plural(overdueWork, "task")} of yours ${plural(overdueWork, "is", "are")} past due`,
      body: "The due date has passed. Finish it, or mark it blocked with the reason, so the person who assigned it is not guessing.",
      metric: `${overdueWork} overdue`,
      action: { label: "Open My work", href: "/student/work" },
      weight: 300 + overdueWork
    }));
  }

  if (blockedWork > 0) {
    out.push(card({
      id: "work-blocked",
      tone: "watch",
      title: `${blockedWork} ${plural(blockedWork, "task")} flagged blocked`,
      body: "A blocked task is a request for help. The reason you wrote is what your head reads first — keep it specific.",
      metric: `${blockedWork} blocked`,
      action: { label: "Open My work", href: "/student/work" },
      weight: 200 + blockedWork
    }));
  }

  if (submittedWork > 0) {
    out.push(card({
      id: "work-in-review",
      tone: "watch",
      title: `${submittedWork} ${plural(submittedWork, "submission")} waiting on a reviewer`,
      body: "Your evidence is in. Nothing else is owed from you until someone answers, so do not resubmit the same work.",
      metric: `${submittedWork} in review`,
      action: { label: "Open My work", href: "/student/work" },
      weight: 150 + submittedWork
    }));
  }

  if (daysSinceActive !== null && daysSinceActive >= 14) {
    out.push(card({
      id: "quiet-fortnight",
      tone: "risk",
      title: `No recorded activity for ${daysSinceActive} days`,
      body: "Momentum is the one thing a chapter cannot do for you. Start with a single small node, not the whole roadmap.",
      metric: daysText(daysSinceActive),
      action: { label: "Pick up the roadmap", href: "/student/roadmap" },
      weight: 250 + daysSinceActive
    }));
  } else if (daysSinceActive !== null && daysSinceActive >= 7) {
    out.push(card({
      id: "quiet-week",
      tone: "watch",
      title: `Quiet for ${daysSinceActive} days`,
      body: "A week away is normal. Two becomes a habit. One practice set or one node gets the streak back.",
      metric: daysText(daysSinceActive),
      action: { label: "Open Practice", href: "/student/practice" },
      weight: 100 + daysSinceActive
    }));
  }

  if (provisionalNodes > 0) {
    out.push(card({
      id: "claims-unverified",
      tone: "next",
      title: `${provisionalNodes} completed ${plural(provisionalNodes, "node")} still unverified`,
      body: "A tick is a claim until a lead confirms it. Verified progress is the number that counts on your card and in seat decisions.",
      metric: `${provisionalNodes} unverified`,
      action: { label: "Show the nodes", href: "/student/roadmap" },
      weight: 120 + provisionalNodes
    }));
  }

  if (nodesTotal > 0 && roadmapPct < 30) {
    out.push(card({
      id: "roadmap-foundations",
      tone: "next",
      title: "Depth beats breadth right now",
      body: `You are ${roadmapPct}% through the roadmap. Finish the next node before opening another track — half-finished paths do not compound.`,
      metric: `${roadmapPct}% roadmap`,
      action: { label: "Continue the roadmap", href: "/student/roadmap" },
      weight: 90
    }));
  }

  if (nodesTotal > 0 && roadmapPct >= 30 && ossVerified === 0) {
    out.push(card({
      id: "first-public-proof",
      tone: "next",
      title: "Turn progress into public proof",
      body: `${roadmapPct}% of the roadmap is done. One merged pull request is the part other people can check without trusting you.`,
      metric: "no merged PR yet",
      action: { label: "Find a first issue", href: "/student/opensource" },
      weight: 80
    }));
  }

  if (practiceTotal > 0 && practiceSolved === 0) {
    out.push(card({
      id: "practice-untouched",
      tone: "next",
      title: "This week's practice set is untouched",
      body: `${practiceTotal} ${plural(practiceTotal, "problem")} are open for the week. The set is small on purpose; finishing it beats starting it.`,
      metric: `0 of ${practiceTotal}`,
      action: { label: "Open Practice", href: "/student/practice" },
      weight: 70
    }));
  }

  if (consistencyKnown && peerCount >= 3 && peerConsistency > 0) {
    if (consistency >= peerConsistency + 10) {
      out.push(card({
        id: "consistency-ahead",
        tone: "win",
        title: "You show up more than most of the chapter",
        body: `You were active ${consistency}% of the last 30 days; peers average ${peerConsistency}%. Consistency is what turns a sprint into a skill.`,
        metric: `+${consistency - peerConsistency} pts`,
        action: { label: "See where you stand", href: "/student/leaderboard" },
        weight: 40
      }));
    } else if (consistency + 10 < peerConsistency) {
      out.push(card({
        id: "consistency-behind",
        tone: "watch",
        title: "Your month is thinner than your peers'",
        body: `You are at ${consistency}% consistency; peers average ${peerConsistency}%. Two short sessions a week close that gap faster than one long one.`,
        metric: `${peerConsistency - consistency} pts behind`,
        action: { label: "Open the roadmap", href: "/student/roadmap" },
        weight: 110
      }));
    }
  }

  if (eventsRegistered >= 3 && eventsAttended === 0) {
    out.push(card({
      id: "events-no-show",
      tone: "watch",
      title: `Signed up for ${eventsRegistered} events, attended none`,
      body: "Registration is a promise to the organiser. Cancel the ones you cannot make, and turn up to the next one.",
      metric: `0 of ${eventsRegistered}`,
      action: { label: "See events", href: "/student/events" },
      weight: 105
    }));
  } else if (eventsAttended >= 2 && eventsRegistered > 0) {
    const attendedPct = Math.round((eventsAttended / eventsRegistered) * 100);
    if (attendedPct >= 75) {
      out.push(card({
        id: "events-turnout",
        tone: "win",
        title: `You turn up: ${attendedPct}% attendance`,
        body: `${eventsAttended} of ${eventsRegistered} events. Reliability is the thing leads remember when a seat opens.`,
        metric: `${attendedPct}%`,
        weight: 30
      }));
    }
  }

  if (coreSeats.length > 0 && reviewQueue > 0) {
    const where = coreSeats.length === 1 ? coreSeats[0] : `${coreSeats.length} departments`;
    out.push(card({
      id: "core-review-queue",
      tone: "next",
      title: `${reviewQueue} ${plural(reviewQueue, "submission")} in ${where} need a reviewer`,
      body: "Core is a review seat before it is a badge. Someone's work is stopped until this is answered.",
      metric: `${reviewQueue} waiting`,
      action: { label: "Open My work", href: "/student/work" },
      weight: 130 + reviewQueue
    }));
  } else if (coreSeats.length > 0) {
    out.push(card({
      id: "core-review-clear",
      tone: "win",
      title: "Nothing is waiting on your review",
      body: "You hold a Core seat and the queue in front of it is clear. That is the seat doing its job.",
      metric: "clear",
      weight: 20
    }));
  }

  if (mentees > 0) {
    out.push(card({
      id: "mentor-loop",
      tone: "win",
      title: `You are mentoring ${mentees} ${plural(mentees, "member")}`,
      body: `${mentorSessions} ${plural(mentorSessions, "session")} on record. Mentoring is the loop that keeps a chapter going after one batch graduates.`,
      metric: `${mentorSessions} ${plural(mentorSessions, "session")}`,
      action: { label: "Open mentorship", href: "/student/mentorship" },
      weight: 35
    }));
  }

  if (ledDepartments > 0) {
    out.push(card({
      id: "lead-console",
      tone: "next",
      title: `You lead ${ledDepartments} ${plural(ledDepartments, "department")}`,
      body: "Overdue work, unowned tasks, turnout and Core requests for your scope are read together in the console.",
      metric: `${ledDepartments} ${plural(ledDepartments, "seat")}`,
      action: { label: "Open the console", href: "/lead/overview" },
      weight: 60
    }));
  }

  return rankInsights(out);
}

function queueIndex(queue) {
  return new Map((queue?.items || []).filter(Boolean).map((item) => [item.key, item]));
}

function queueCount(index, key) {
  return int(index.get(key)?.count);
}

function queueWaiting(index, key) {
  const value = index.get(key)?.waitingDays;
  return value === null || value === undefined ? null : int(value);
}

function waitingSentence(days, noun) {
  if (days === null || days <= 0) return "";
  return ` The oldest ${noun} has waited ${daysText(days)}.`;
}

/**
 * A lead's reading of their own scope.
 *
 * @param {object} input
 * @param {object} [input.queue]    lib/queue.js output (counts + age + href)
 * @param {object} [input.overview] lib/lead.js output (roster, departments, charts)
 */
export function leadInsights({ queue, overview } = {}) {
  const out = [];
  const index = queueIndex(queue);
  const roster = Array.isArray(overview?.roster) ? overview.roster : [];
  const departments = Array.isArray(overview?.departments) ? overview.departments : [];
  const charts = overview?.charts || {};
  const members = roster.length;
  const turnoutPct = charts.turnoutPct === null || charts.turnoutPct === undefined
    ? null
    : int(charts.turnoutPct);
  const quietMembers = int(charts.quietMembers);
  const noProofMembers = int(charts.noProofMembers);
  const successionGap = departments.filter(
    (d) => int(d.members) > 0 && int(d.succession_ready) === 0
  ).length;

  const overdue = queueCount(index, "overdue_work");
  if (overdue > 0) {
    out.push(card({
      id: "dept-overdue",
      tone: "risk",
      title: `${overdue} ${plural(overdue, "piece")} of department work ${plural(overdue, "is", "are")} past due`,
      body: `A missed deadline is usually a missing owner or an unclear ask, not laziness.${waitingSentence(queueWaiting(index, "overdue_work"), "overdue task")}`,
      metric: `${overdue} overdue`,
      action: { label: "Open departments", href: index.get("overdue_work")?.href || "/lead/departments" },
      weight: 300 + overdue
    }));
  }

  const unowned = queueCount(index, "unassigned_work");
  if (unowned > 0) {
    out.push(card({
      id: "dept-unowned",
      tone: "risk",
      title: `${unowned} open ${plural(unowned, "task")} with no owner`,
      body: "Unowned work never appears in anyone's My work, so it waits forever. Assign it or close it — both are decisions.",
      metric: `${unowned} unowned`,
      action: { label: "Assign work", href: index.get("unassigned_work")?.href || "/lead/departments" },
      weight: 290 + unowned
    }));
  }

  const reviews = queueCount(index, "task_reviews");
  if (reviews > 0) {
    out.push(card({
      id: "dept-reviews",
      tone: "next",
      title: `${reviews} ${plural(reviews, "submission")} waiting for your review`,
      body: `Someone cannot move until you answer.${waitingSentence(queueWaiting(index, "task_reviews"), "submission")}`,
      metric: `${reviews} in review`,
      action: { label: "Review submissions", href: index.get("task_reviews")?.href || "/lead/departments" },
      weight: 180 + reviews
    }));
  }

  const seats = queueCount(index, "seat_requests");
  if (seats > 0) {
    out.push(card({
      id: "dept-seat-requests",
      tone: "next",
      title: `${seats} Core ${plural(seats, "request")} waiting`,
      body: `Approve it, or decline with a reason. Both are answers; silence is the only wrong one.${waitingSentence(queueWaiting(index, "seat_requests"), "request")}`,
      metric: `${seats} waiting`,
      action: { label: "Open the roster", href: index.get("seat_requests")?.href || "/lead/roster" },
      weight: 170 + seats
    }));
  }

  const blocked = queueCount(index, "blocked_work");
  if (blocked > 0) {
    out.push(card({
      id: "dept-blocked",
      tone: "watch",
      title: `${blocked} ${plural(blocked, "task")} reported blocked`,
      body: "Read the reasons together. The same block three times is a process problem, not three people problem.",
      metric: `${blocked} blocked`,
      action: { label: "Open departments", href: index.get("blocked_work")?.href || "/lead/departments" },
      weight: 160 + blocked
    }));
  }

  if (quietMembers > 0) {
    out.push(card({
      id: "dept-quiet-members",
      tone: "watch",
      title: `${quietMembers} ${plural(quietMembers, "member")} have not shown activity in 21 days`,
      body: "No GitHub signal is not proof of no work, but it is the only signal this console has. Ask one of them what they are building.",
      metric: `${quietMembers} quiet`,
      action: { label: "Open the roster", href: "/lead/roster" },
      weight: 140 + quietMembers
    }));
  }

  if (noProofMembers > 0 && members >= 5) {
    out.push(card({
      id: "dept-no-proof",
      tone: "watch",
      title: `${noProofMembers} ${plural(noProofMembers, "member")} have no verified proof yet`,
      body: "Verified work is what a seat decision can point at. Clearing the review queue is the fastest lever you have.",
      metric: `${noProofMembers} without proof`,
      action: { label: "Open the roster", href: "/lead/roster" },
      weight: 135 + noProofMembers
    }));
  }

  if (turnoutPct !== null && turnoutPct < 50) {
    out.push(card({
      id: "dept-turnout-low",
      tone: "watch",
      title: `Turnout is ${turnoutPct}%`,
      body: "Registration without attendance is a promise the chapter did not keep. Ask why the last one did not land before scheduling the next.",
      metric: `${turnoutPct}% attended`,
      action: { label: "See workshops", href: "/lead/workshops" },
      weight: 120
    }));
  } else if (turnoutPct !== null && turnoutPct >= 75) {
    out.push(card({
      id: "dept-turnout-high",
      tone: "win",
      title: `Turnout is ${turnoutPct}%`,
      body: "People register and then actually arrive. Whatever you are doing before the event is working — keep the format.",
      metric: `${turnoutPct}% attended`,
      action: { label: "See workshops", href: "/lead/workshops" },
      weight: 40
    }));
  }

  if (successionGap > 0) {
    out.push(card({
      id: "dept-succession",
      tone: "watch",
      title: `${successionGap} ${plural(successionGap, "department")} with nobody marked succession-ready`,
      body: "A tenure that ends without a successor is a department that stops until an admin intervenes. Mark the person already doing the work.",
      metric: `${successionGap} gap${successionGap === 1 ? "" : "s"}`,
      action: { label: "Open succession", href: "/lead/succession" },
      weight: 115 + successionGap
    }));
  }

  const urgent = out.some((item) => item.tone === "risk" || item.tone === "watch" || item.tone === "next");
  if (!urgent && members > 0) {
    out.push(card({
      id: "dept-all-clear",
      tone: "win",
      title: "Nothing in your scope is overdue, unowned, or unanswered",
      body: "The queue is clear. Use the quiet week on the two things no dashboard can force: a successor, and one conversation with a quiet member.",
      metric: "clear",
      weight: 10
    }));
  }

  return rankInsights(out);
}

/**
 * The chapter-level reading.
 *
 * @param {object} input
 * @param {object} [input.queue]      lib/queue.js output for an admin
 * @param {object} [input.analytics]  { health, history, bottlenecks, mentors, contests }
 */
export function adminInsights({ queue, analytics } = {}) {
  const out = [];
  const index = queueIndex(queue);
  const health = analytics?.health || null;
  const history = Array.isArray(analytics?.history) ? analytics.history : [];
  const bottlenecks = Array.isArray(analytics?.bottlenecks) ? analytics.bottlenecks : [];
  const mentors = Array.isArray(analytics?.mentors) ? analytics.mentors : [];
  const contests = Array.isArray(analytics?.contests) ? analytics.contests : [];

  const totalStudents = int(health?.total_students);
  const active7d = int(health?.active_students_7d);
  const activePct = totalStudents > 0 ? Math.round((active7d / totalStudents) * 100) : null;

  if (activePct !== null && activePct < 40) {
    out.push(card({
      id: "chapter-activation-low",
      tone: "risk",
      title: `Only ${activePct}% of the chapter was active this week`,
      body: `${active7d} of ${totalStudents} members. A quiet chapter is usually a scheduling problem or a roadmap that stopped being interesting — check both before adding a programme.`,
      metric: `${activePct}% active`,
      action: { label: "Open analytics", href: "/admin/analytics" },
      weight: 300 + (40 - activePct)
    }));
  } else if (activePct !== null && activePct >= 65) {
    out.push(card({
      id: "chapter-activation-high",
      tone: "win",
      title: `${activePct}% of the chapter was active this week`,
      body: `${active7d} of ${totalStudents} members. This is the number every other programme is trying to move — protect whatever is causing it.`,
      metric: `${activePct}% active`,
      action: { label: "Open analytics", href: "/admin/analytics" },
      weight: 45
    }));
  }

  // Newest-first from the query; flip to oldest-first for a window comparison.
  if (history.length >= 8) {
    const ordered = [...history].reverse();
    const recent = ordered.slice(-7).map((row) => num(row.active_students_7d));
    const previous = ordered.slice(-14, -7).map((row) => num(row.active_students_7d));
    const avg = (list) => (list.length ? list.reduce((sum, n) => sum + n, 0) / list.length : 0);
    const now = avg(recent);
    const before = avg(previous);
    if (before > 0 && now > 0) {
      const deltaPct = Math.round(((now - before) / before) * 100);
      if (deltaPct <= -15) {
        out.push(card({
          id: "chapter-activity-falling",
          tone: "watch",
          title: `Weekly activity fell ${Math.abs(deltaPct)}%`,
          body: `The last seven days average ${Math.round(now)} active members, down from ${Math.round(before)} the week before. Something changed; find it before the month closes.`,
          metric: `${deltaPct}%`,
          action: { label: "Open analytics", href: "/admin/analytics" },
          weight: 150 + Math.abs(deltaPct)
        }));
      } else if (deltaPct >= 15) {
        out.push(card({
          id: "chapter-activity-rising",
          tone: "win",
          title: `Weekly activity rose ${deltaPct}%`,
          body: `The last seven days average ${Math.round(now)} active members, up from ${Math.round(before)}. Note what shipped in that window — it is repeatable.`,
          metric: `+${deltaPct}%`,
          weight: 50
        }));
      }
    }
  }

  const worst = bottlenecks
    .filter((node) => int(node.total_started) > 0)
    .sort((a, b) => num(b.drop_off_pct) - num(a.drop_off_pct))[0];
  if (worst && num(worst.drop_off_pct) >= 50) {
    out.push(card({
      id: "chapter-bottleneck",
      tone: "watch",
      title: `${int(worst.drop_off_pct)}% of members stall at ${worst.title || "one node"}`,
      body: `${int(worst.total_completed)} of ${int(worst.total_started)} finish it. Either the node is too large or the material before it is too thin; split it or add a worked example.`,
      metric: `${int(worst.drop_off_pct)}% drop-off`,
      action: { label: "Open roadmaps", href: "/admin/roadmaps" },
      weight: 200 + int(worst.drop_off_pct)
    }));
  }

  const proof = queueCount(index, "proof_reviews");
  if (proof > 0) {
    out.push(card({
      id: "chapter-proof-queue",
      tone: "next",
      title: `${proof} ${plural(proof, "piece")} of proof awaiting verification`,
      body: `This is the queue that unlocks Core seats: a request needs verified work behind it.${waitingSentence(queueWaiting(index, "proof_reviews"), "submission")}`,
      metric: `${proof} unverified`,
      action: { label: "Review proof", href: index.get("proof_reviews")?.href || "/admin/ranking" },
      weight: 180 + proof
    }));
  }

  const seats = queueCount(index, "seat_requests");
  if (seats > 0) {
    out.push(card({
      id: "chapter-seat-requests",
      tone: "next",
      title: `${seats} seat ${plural(seats, "request")} waiting`,
      body: `A request that sits unanswered reads as a closed door.${waitingSentence(queueWaiting(index, "seat_requests"), "request")}`,
      metric: `${seats} waiting`,
      action: { label: "Open requests", href: index.get("seat_requests")?.href || "/admin/requests" },
      weight: 170 + seats
    }));
  }

  const proposals = queueCount(index, "proposed_events");
  if (proposals > 0) {
    out.push(card({
      id: "chapter-event-proposals",
      tone: "next",
      title: `${proposals} event ${plural(proposals, "proposal")} awaiting review`,
      body: `A proposed workshop is a lead who has already done the planning.${waitingSentence(queueWaiting(index, "proposed_events"), "proposal")}`,
      metric: `${proposals} proposed`,
      action: { label: "Review events", href: index.get("proposed_events")?.href || "/admin/events" },
      weight: 160 + proposals
    }));
  }

  const mentorApps = queueCount(index, "mentor_applications");
  if (mentorApps > 0) {
    out.push(card({
      id: "chapter-mentor-applications",
      tone: "next",
      title: `${mentorApps} mentor ${plural(mentorApps, "application")} waiting`,
      body: "Mentor supply is the bottleneck behind every mentorship programme. Answering this week keeps the next cohort covered.",
      metric: `${mentorApps} waiting`,
      action: { label: "Open mentors", href: index.get("mentor_applications")?.href || "/admin/mentors" },
      weight: 150 + mentorApps
    }));
  }

  const judging = queueCount(index, "contest_judging");
  if (judging > 0) {
    out.push(card({
      id: "chapter-contest-judging",
      tone: "next",
      title: `${judging} contest ${plural(judging, "submission")} awaiting judging`,
      body: "Unjudged work teaches members that entering does not matter. Clear it before the next contest opens.",
      metric: `${judging} to judge`,
      action: { label: "Open contests", href: index.get("contest_judging")?.href || "/admin/contests" },
      weight: 140 + judging
    }));
  }

  const overdue = queueCount(index, "overdue_work");
  if (overdue > 0) {
    out.push(card({
      id: "chapter-overdue-work",
      tone: "risk",
      title: `${overdue} ${plural(overdue, "piece")} of chapter work ${plural(overdue, "is", "are")} past due`,
      body: `Overdue work is a signal about ownership and scope, not only effort.${waitingSentence(queueWaiting(index, "overdue_work"), "overdue task")}`,
      metric: `${overdue} overdue`,
      action: { label: "Open departments", href: index.get("overdue_work")?.href || "/admin/departments" },
      weight: 280 + overdue
    }));
  }

  const unowned = queueCount(index, "unassigned_work");
  if (unowned > 0) {
    out.push(card({
      id: "chapter-unowned-work",
      tone: "watch",
      title: `${unowned} open ${plural(unowned, "task")} with no owner`,
      body: "Nothing appears in a member's My work until it has an owner. Assign it, or archive it and stop pretending it is planned.",
      metric: `${unowned} unowned`,
      action: { label: "Open departments", href: index.get("unassigned_work")?.href || "/admin/departments" },
      weight: 190 + unowned
    }));
  }

  if (mentors.length >= 3) {
    const idle = mentors.filter((m) => int(m.session_count) === 0).length;
    if (idle > 0) {
      out.push(card({
        id: "chapter-idle-mentors",
        tone: "watch",
        title: `${idle} ${plural(idle, "mentor")} with no sessions yet`,
        body: "An approved mentor nobody books is invisible capacity. Check availability and price before recruiting more mentors.",
        metric: `${idle} idle`,
        action: { label: "Open mentors", href: "/admin/mentors" },
        weight: 100 + idle
      }));
    }
  }

  const weakestContest = contests
    .filter((c) => int(c.regs) >= 10)
    .map((c) => ({ ...c, rate: int(c.regs) > 0 ? Math.round((int(c.subs) / int(c.regs)) * 100) : 0 }))
    .filter((c) => c.rate < 30)
    .sort((a, b) => a.rate - b.rate)[0];
  if (weakestContest) {
    out.push(card({
      id: "chapter-contest-dropoff",
      tone: "watch",
      title: `${weakestContest.rate}% of entrants submitted to ${weakestContest.title || "a contest"}`,
      body: `${int(weakestContest.subs)} of ${int(weakestContest.regs)} registrations produced work. Shorten the brief or check the deadline against exams.`,
      metric: `${weakestContest.rate}% submit rate`,
      action: { label: "Open contests", href: "/admin/contests" },
      weight: 90
    }));
  }

  const urgent = out.some((item) => item.tone === "risk" || item.tone === "watch" || item.tone === "next");
  if (!urgent && totalStudents > 0) {
    out.push(card({
      id: "chapter-all-clear",
      tone: "win",
      title: "The chapter's queues are clear",
      body: "No unverified proof, no unanswered seats, no overdue department work. Spend the quiet time on the bottleneck node — it is the cheapest retention win available.",
      metric: "clear",
      weight: 10
    }));
  }

  return rankInsights(out);
}
