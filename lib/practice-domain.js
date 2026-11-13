export const DAY_MS = 86_400_000;
export const IST_OFFSET_MS = 330 * 60_000;
export const PRACTICE_QUESTIONS_PER_WEEK = 7;
export const PRACTICE_TIMEZONE = "Asia/Kolkata";

function ms(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string" && value) return new Date(value).getTime();
  return NaN;
}

function istParts(now) {
  const shifted = new Date(now + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    seconds: shifted.getUTCSeconds()
  };
}

export function weekStart(now = Date.now()) {
  const shifted = new Date(now + IST_OFFSET_MS);
  const midnight = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return midnight - ((shifted.getUTCDay() + 6) % 7) * DAY_MS - IST_OFFSET_MS;
}

export function monthBounds(now = Date.now()) {
  const { year, month } = istParts(now);
  return [
    Date.UTC(year, month, 1) - IST_OFFSET_MS,
    Date.UTC(year, month + 1, 1) - IST_OFFSET_MS
  ];
}

export function historyCutoff(now = Date.now()) {
  const { year, month, day, hours, minutes, seconds } = istParts(now);
  const lastDay = new Date(Date.UTC(year, month - 2, 0)).getUTCDate();
  return Date.UTC(year, month - 3, Math.min(day, lastDay), hours, minutes, seconds) - IST_OFFSET_MS;
}

export function isReleased(week, now = Date.now()) {
  return week?.status === "scheduled" && ms(week.startAt) <= now;
}

export function eligible(week, acceptedAt, now = Date.now()) {
  const at = ms(acceptedAt);
  const start = ms(week?.startAt);
  const end = ms(week?.endAt);
  return isReleased(week, now) && Number.isFinite(at) && at >= start && at < end && at <= now;
}

export function problemSlug(link) {
  let url;
  try {
    url = new URL(String(link || ""));
  } catch {
    throw new Error("Enter a valid LeetCode problem URL.");
  }
  const match = url.pathname.match(/^\/problems\/([a-z0-9-]+)(?:\/.*)?$/);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    !["leetcode.com", "www.leetcode.com"].includes(host) ||
    url.username ||
    url.password ||
    url.port ||
    !match
  ) {
    throw new Error("Use an https://leetcode.com/problems/... link.");
  }
  return match[1];
}

export function validateQuestions(items, scheduling = false) {
  if (!Array.isArray(items) || items.length > PRACTICE_QUESTIONS_PER_WEEK) {
    throw new Error("A week can contain at most seven questions.");
  }
  if (scheduling && items.length !== PRACTICE_QUESTIONS_PER_WEEK) {
    throw new Error("A scheduled week must contain exactly seven questions.");
  }
  const parsed = items.map((question, index) => {
    const title = String(question?.title || "").trim();
    if (!title || title.length > 160) {
      throw new Error(`Question ${index + 1} needs a title of up to 160 characters.`);
    }
    if (!["Easy", "Medium", "Hard"].includes(question?.difficulty)) {
      throw new Error("Choose Easy, Medium, or Hard for each question.");
    }
    return {
      title,
      slug: problemSlug(String(question?.url || "")),
      difficulty: question.difficulty,
      topic: String(question?.topic || "").trim().slice(0, 80),
      position: index + 1
    };
  });
  if (new Set(parsed.map((question) => question.slug)).size !== parsed.length) {
    throw new Error("Each question in a week must be distinct.");
  }
  return parsed;
}

export function computeCredits(weeks = [], questions = [], solves = [], corrections = [], now = Date.now()) {
  const released = new Map(
    weeks.filter((week) => isReleased(week, now)).map((week) => [String(week.id), week])
  );
  const overrides = new Map(
    corrections.map((correction) => [`${correction.userId}:${correction.questionId}`, correction])
  );
  const solvesBySlug = new Map();
  for (const solve of solves) {
    const list = solvesBySlug.get(solve.slug) || [];
    list.push(solve);
    solvesBySlug.set(solve.slug, list);
  }

  const result = new Map();
  for (const question of questions) {
    const week = released.get(String(question.weekId));
    if (!week) continue;
    const keyPrefix = String(question.id);
    for (const solve of solvesBySlug.get(question.slug) || []) {
      const key = `${solve.userId}:${keyPrefix}`;
      if (overrides.has(key) || !eligible(week, solve.acceptedAt, now)) continue;
      const prior = result.get(key);
      if (!prior || ms(solve.acceptedAt) < ms(prior.acceptedAt)) {
        result.set(key, {
          userId: solve.userId,
          questionId: question.id,
          weekId: week.id,
          acceptedAt: ms(solve.acceptedAt),
          source: "sync"
        });
      }
    }
    for (const correction of corrections) {
      if (String(correction.questionId) !== String(question.id)) continue;
      if (!correction.credited) continue;
      if (correction.acceptedAt === null || correction.acceptedAt === undefined) continue;
      if (!eligible(week, correction.acceptedAt, now)) continue;
      result.set(`${correction.userId}:${question.id}`, {
        userId: correction.userId,
        questionId: question.id,
        weekId: week.id,
        acceptedAt: ms(correction.acceptedAt),
        source: "admin"
      });
    }
  }
  return [...result.values()];
}

export function rankMembers(members = [], credits = [], filter = () => true) {
  const counts = new Map();
  for (const credit of credits) {
    if (!filter(credit)) continue;
    counts.set(credit.userId, (counts.get(credit.userId) || 0) + 1);
  }
  const sorted = members
    .map((member) => ({ ...member, score: counts.get(member.id) || 0 }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(a.name || "").localeCompare(String(b.name || "")) ||
        String(a.id).localeCompare(String(b.id))
    );
  let rank = 0;
  return sorted.map((member, index) => {
    if (!index || member.score !== sorted[index - 1].score) rank = index + 1;
    return { ...member, rank };
  });
}

export function parseAccepted(payload, userId, now = Date.now()) {
  if (
    payload?.errors?.length ||
    !payload?.data?.matchedUser ||
    !Array.isArray(payload?.data?.recentAcSubmissionList)
  ) {
    throw new Error("Profile unavailable. Check the username and public submission visibility.");
  }
  const seen = new Set();
  return payload.data.recentAcSubmissionList
    .map((submission) => {
      const externalId = String(submission?.id || "");
      const slug = String(submission?.titleSlug || "");
      const acceptedAt = Number(submission?.timestamp) * 1000;
      if (
        !/^\d+$/.test(externalId) ||
        !/^[a-z0-9-]+$/.test(slug) ||
        !Number.isFinite(acceptedAt) ||
        acceptedAt <= 0 ||
        acceptedAt > now
      ) {
        throw new Error("LeetCode returned an unexpected submission format.");
      }
      return {
        userId,
        externalId,
        slug,
        acceptedAt,
        id: `${userId}:${externalId}`
      };
    })
    .filter((submission) => {
      if (seen.has(submission.id)) return false;
      seen.add(submission.id);
      return true;
    });
}

export function retryDelay(failures) {
  const attempt = Math.max(1, Number(failures) || 1);
  return Math.min(6 * 60 * 60_000, 15 * 60_000 * 2 ** Math.min(attempt - 1, 5));
}

export function automaticSyncDue(connection, now = Date.now()) {
  if (!connection?.active) return false;
  const next = ms(connection.nextSyncAt);
  const lease = ms(connection.leaseUntil);
  const last = connection.lastSyncAt === null || connection.lastSyncAt === undefined
    ? null
    : ms(connection.lastSyncAt);
  if (!Number.isFinite(next) || !Number.isFinite(lease)) return false;
  return next <= now && lease < now && (last === null || last <= now - 3_600_000);
}

export function formatIstDate(value, options = {}) {
  const time = ms(value);
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: PRACTICE_TIMEZONE,
    day: "numeric",
    month: "short",
    ...options
  }).format(time);
}

export function istDateInput(value) {
  const time = ms(value);
  if (!Number.isFinite(time)) return "";
  return new Date(time + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function istDateTimeInput(value) {
  const time = ms(value);
  if (!Number.isFinite(time)) return "";
  return new Date(time + IST_OFFSET_MS).toISOString().slice(0, 16);
}
