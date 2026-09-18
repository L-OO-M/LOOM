import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, StatusPill } from "@/components/loom/primitives";
import { VoteButton } from "../CommunityBits";
import { ThreadForm } from "./ForumsBits";

export const dynamic = "force-dynamic";

const DOMAINS = ["", "general", "ai_ml", "web", "cybersecurity", "dsa", "blockchain"];
const STATES = ["all", "unsolved", "unanswered"];

function ageLabel(value) {
  if (!value) return "";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export default async function ForumsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/community/forums");
  const { tenant, user, sql } = ctx;
  const tid = tenant?.id ?? null;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const domain = sp?.domain || "";
  const sort = sp?.sort === "top" ? "top" : "recent";
  const state = STATES.includes(sp?.state) ? sp?.state : "all";

  const orderBy = sort === "top"
    ? sql`t.pinned DESC, t.upvote_count DESC, t.updated_at DESC`
    : sql`t.pinned DESC, t.updated_at DESC`;
  const threads = await sql`
    SELECT t.*, p.name AS author_name,
      up.username AS author_username, up.is_public AS author_public
    FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    LEFT JOIN user_profiles up ON up.user_id = t.author_id AND up.tenant_id = ${tid}::uuid AND up.is_public = true
    WHERE t.tenant_id = ${tid}::uuid AND t.status = 'visible'
      AND (${domain} = '' OR t.domain = ${domain})
      AND (${state} = 'all' OR (${state} = 'unsolved' AND t.solved = false) OR (${state} = 'unanswered' AND t.reply_count = 0))
      AND (${q} = '' OR (t.title ILIKE ${`%${q}%`} OR t.body ILIKE ${`%${q}%`}))
    ORDER BY ${orderBy}
    LIMIT 50
  `;
  let votedIds = new Set();
  if (threads.length > 0) {
    const ids = threads.map((t) => t.id);
    const votes = await sql`
      SELECT target_id FROM forum_votes
      WHERE student_id = ${user.id} AND target_type = 'thread' AND target_id = ANY(${ids}::uuid[])
    `;
    votedIds = new Set(votes.map((v) => String(v.target_id)));
  }

  const kept = { q: sp?.q || "", domain, sort, state };
  const stateHref = (s) => {
    const params = new URLSearchParams();
    if (kept.q) params.set("q", kept.q);
    if (kept.domain) params.set("domain", kept.domain);
    params.set("sort", kept.sort);
    if (s !== "all") params.set("state", s);
    const qs = params.toString();
    return `/student/community/forums${qs ? `?${qs}` : ""}`;
  };

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Link href="/student/community" prefetch={false} className="meta hover:underline" style={{ color: "var(--accent)" }}>← Community</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Meta>Room 01 · ask, answer, solve</Meta>
            <Display size="lg" className="mt-3">Forums.</Display>
            <p className="mt-2 max-w-xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              Ask something → help someone → solve it. Server-backed search; pinned first.
            </p>
          </div>
          <ThreadForm />
        </div>

        <div className="mt-7 flex flex-wrap gap-2" role="group" aria-label="Thread state">
          {STATES.map((s) => {
            const active = state === s;
            return (
              <Link
                key={s}
                href={stateHref(s)}
                prefetch={false}
                aria-current={active ? "true" : undefined}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                style={active
                  ? { borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--text)" }
                  : { borderColor: "var(--line)", color: "var(--text-muted)" }}
              >
                {s === "all" ? "All" : s === "unsolved" ? "Unsolved" : "Unanswered"}
              </Link>
            );
          })}
        </div>

        <form method="get" className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <input type="hidden" name="state" value={state} />
          <input name="q" defaultValue={sp?.q || ""} placeholder="Search threads…" aria-label="Search threads" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }} />
          <div className="flex gap-2">
            <select name="domain" defaultValue={domain} aria-label="Filter by domain" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm sm:flex-none" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
              {DOMAINS.map((d) => <option key={d} value={d}>{d === "" ? "All domains" : d}</option>)}
            </select>
            <select name="sort" defaultValue={sort} aria-label="Sort threads" className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
              <option value="recent">Recent</option>
              <option value="top">Top</option>
            </select>
            <button className="btn-ink !py-2" type="submit">Filter</button>
          </div>
        </form>

        {threads.length === 0 ? (
          <p className="narrative mt-8">No threads match. Be the first to ask — someone in your chapter knows the answer.</p>
        ) : (
          <ul className="mt-6 divide-y" style={{ borderColor: "var(--line)" }}>
            {threads.map((t) => (
              <li key={t.id} className="flex items-start gap-4 border-t py-4 first:border-t" style={{ borderColor: "var(--line)" }}>
                <span className="pt-0.5"><VoteButton targetType="thread" targetId={t.id} count={t.upvote_count} initialVoted={votedIds.has(String(t.id))} /></span>
                <div className="min-w-0 flex-1">
                  <Link href={`/student/community/forums/${t.id}`} prefetch={false} className="block text-[0.98rem] font-semibold leading-6 hover:underline" style={{ color: "var(--text)" }}>
                    {t.title}
                  </Link>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {t.pinned ? <StatusPill tone="warn">pinned</StatusPill> : null}
                    {t.solved ? <StatusPill tone="ok">✓ solved</StatusPill> : <StatusPill>open</StatusPill>}
                    {t.reply_count === 0 ? <StatusPill>needs answer</StatusPill> : null}
                  </p>
                  <p className="meta mt-1.5 block">
                    {t.author_username && t.author_public ? (
                      <Link href={`/student/${t.author_username}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>{t.author_name || `@${t.author_username}`}</Link>
                    ) : (
                      <span>{t.author_name || "a student"}</span>
                    )}
                    {` · ${t.domain} · ▲${t.upvote_count} · ${t.reply_count} ${t.reply_count === 1 ? "reply" : "replies"} · ${t.view_count} views · ${ageLabel(t.updated_at)}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
