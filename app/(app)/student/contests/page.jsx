import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, StatusPill, PlainStat, ActionLink } from "@/components/loom/primitives";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import { OnboardingState } from "@/components/loom/States";
import { Reveal } from "@/components/motion/Reveal";

export const dynamic = "force-dynamic";

const SCOPES = [
  { id: "open", label: "Open" },
  { id: "announced", label: "Announced" },
  { id: "past", label: "Past" }
];

// Student-facing status vocabulary. Raw database values (draft, published,
// active, …) never reach the UI. Drafts are filtered out of the query below
// and stay visible only in the admin workspace.
const OPEN_STATUSES = new Set(["published", "active", "open"]);

function humanStatus(status) {
  if (OPEN_STATUSES.has(status)) return { label: "Open", tone: "live" };
  if (status === "upcoming") return { label: "Announced", tone: "" };
  return { label: "Closed", tone: "" };
}

function scopeOf(c) {
  if (OPEN_STATUSES.has(c.status)) return "open";
  if (c.status === "upcoming") return "announced";
  return "past";
}

function urgency(c) {
  if (!c.ends_at) return null;
  const ms = new Date(c.ends_at) - new Date();
  if (ms <= 0) return { label: "Closed", tone: "" };
  const h = ms / 3600000;
  if (h < 24) return { label: `Closes in ${Math.max(1, Math.round(h))}h`, tone: "live" };
  const d = Math.round(h / 24);
  if (d === 1) return { label: "Closes tomorrow", tone: "live" };
  if (d <= 7) return { label: `Closes in ${d} days`, tone: "" };
  return { label: `Closes ${new Date(c.ends_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}`, tone: "" };
}

function deadlineLabel(c) {
  if (!c.ends_at) return "No closing date announced";
  const when = new Date(c.ends_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  return new Date(c.ends_at) <= new Date() ? `Closed · ${when}` : when;
}

function qs(scope) {
  return scope === "open" ? "/student/contests" : `/student/contests?scope=${scope}`;
}

export default async function ContestsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/contests");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const scope = SCOPES.some((s) => s.id === sp?.scope) ? sp.scope : "open";

  // Sequential page queries (pooler rule): visible challenges first, then
  // the student's own registrations and submissions. Drafts are excluded —
  // they are admin working state, not student destinations.
  const contests = await sql`
    SELECT c.*,
      (SELECT COUNT(*)::int FROM contest_registrations r WHERE r.contest_id = c.id) AS registrations
    FROM contests c
    WHERE (c.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
      AND c.status <> 'draft'
    ORDER BY c.starts_at NULLS LAST, c.created_at DESC LIMIT 50
  `;
  const regs = await sql`SELECT contest_id FROM contest_registrations WHERE student_id = ${user.id}`;
  const regSet = new Set(regs.map((r) => r.contest_id));
  const subs = await sql`
    SELECT contest_id, COUNT(*)::int AS n, MAX(created_at) AS latest
    FROM contest_submissions WHERE student_id = ${user.id} GROUP BY contest_id
  `;
  const subMap = new Map(subs.map((s) => [s.contest_id, s]));

  const openNow = contests.filter((c) => scopeOf(c) === "open").length;
  const youreIn = contests.filter((c) => regSet.has(c.id)).length;
  const shipped = [...subMap.values()].reduce((n, s) => n + (s.n || 0), 0);
  const visible = contests.filter((c) => scopeOf(c) === scope);
  const mine = contests
    .filter((c) => regSet.has(c.id))
    .sort((a, b) => new Date(a.ends_at || "9999-12-31") - new Date(b.ends_at || "9999-12-31"));

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Reveal>
          <Meta>Prove · challenges with deadlines</Meta>
          <Display size="lg" className="mt-3">Earn it under pressure.</Display>
          <p className="narrative mt-4">
            Timed builds give your work a deadline. Discover a challenge, register, ship
            something real — then carry the result into your proof.
          </p>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="mt-8 grid gap-8 sm:grid-cols-3" aria-label="Challenge summary">
            <PlainStat value={openNow} unit={openNow === 1 ? "challenge" : "challenges"} label="open now and ready to join" />
            <PlainStat value={youreIn} unit={youreIn === 1 ? "challenge" : "challenges"} label="you are registered for" />
            <PlainStat value={shipped} unit={shipped === 1 ? "entry" : "entries"} label="you have shipped" />
          </div>
        </Reveal>

        {mine.length > 0 && (
          <section className="mt-12" aria-label="Your challenges">
            <Meta style={{ color: "var(--accent)" }}>Your challenges · {mine.length} registered</Meta>
            <Timeline className="mt-5">
              {mine.map((c) => {
                const hs = humanStatus(c.status);
                const sub = subMap.get(c.id);
                const closed = scopeOf(c) === "past" || (c.ends_at && new Date(c.ends_at) <= new Date());
                return (
                  <TimelineItem
                    key={c.id}
                    state={sub ? "done" : closed ? "todo" : "now"}
                    title={c.title}
                    meta={deadlineLabel(c)}
                    body={sub ? `Registered · entry shipped${sub.n > 1 ? ` (${sub.n} entries)` : ""}` : closed ? "Registered · entries closed" : "Registered · build and submit before the deadline"}
                    action={
                      <Link href={`/student/contests/${c.id}`} prefetch={false} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                        {sub ? "View or add entries →" : "Open challenge →"}
                      </Link>
                    }
                  />
                );
              })}
            </Timeline>
          </section>
        )}

        <div className="seg mt-12" role="group" aria-label="Challenge scope">
          {SCOPES.map((s) => (
            <Link
              key={s.id}
              href={qs(s.id)}
              prefetch={false}
              aria-pressed={scope === s.id ? "true" : "false"}
              className={scope === s.id ? "!bg-[var(--text)] !text-[var(--bg)] rounded-full px-4 py-1.5 text-sm font-semibold" : "rounded-full px-4 py-1.5 text-sm font-semibold"}
              style={scope === s.id ? undefined : { color: "var(--text-muted)" }}
            >
              {s.label}
            </Link>
          ))}
        </div>

        {visible.length === 0 ? (
          <ScopeEmpty scope={scope} />
        ) : (
          <section className="mt-8" aria-label={scope === "open" ? "Open challenges" : scope === "announced" ? "Announced challenges" : "Past challenges"}>
            <Meta>{scope === "open" ? "Open now" : scope === "announced" ? "Announced" : "Past"} · {visible.length}</Meta>
            <ol className="mt-4">
              {visible.map((c) => (
                <ChallengeRow key={c.id} c={c} registered={regSet.has(c.id)} sub={subMap.get(c.id) || null} />
              ))}
            </ol>
          </section>
        )}

        <section className="mt-12 border-t pt-8" style={{ borderColor: "var(--line)" }} aria-label="What comes next">
          <Meta>After the deadline</Meta>
          <h2 className="h-product mt-2">Work shipped here can become proof.</h2>
          <p className="narrative mt-3">
            Strong challenge work can become part of your signed proof when your chapter
            recognizes it. Standings show where the chapter stands overall.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
            <ActionLink href="/student/credentials">See your Proof →</ActionLink>
            <ActionLink href="/student/leaderboard">See Standings →</ActionLink>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function ChallengeRow({ c, registered, sub }) {
  const hs = humanStatus(c.status);
  const u = urgency(c);
  const past = scopeOf(c) === "past";
  return (
    <li className="border-b py-5 first:border-t" style={{ borderColor: "var(--line)", opacity: past ? 0.7 : 1 }}>
      <Link href={`/student/contests/${c.id}`} prefetch={false} className="row-link flex items-start gap-4 px-2 py-1">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>{c.title}</span>
            {registered && <StatusPill tone="live">you&apos;re registered</StatusPill>}
            {sub && <StatusPill tone="">entry shipped</StatusPill>}
            {!past && u && <StatusPill tone={u.tone}>{u.label}</StatusPill>}
          </span>
          {c.description && <span className="mt-1 line-clamp-2 block text-sm leading-6" style={{ color: "var(--text-muted)" }}>{c.description}</span>}
          <span className="meta mt-2 block">
            {hs.label}
            {c.starts_at ? ` · starts ${new Date(c.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}` : ""}
            {c.ends_at ? ` · ${past ? "closed" : "closes"} ${new Date(c.ends_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}` : " · no closing date announced"}
            {typeof c.registrations === "number" && c.registrations > 0 ? ` · ${c.registrations} registered` : ""}
          </span>
        </span>
        <span className="shrink-0 text-lg" style={{ color: "var(--text-muted)" }} aria-hidden="true">›</span>
      </Link>
    </li>
  );
}

function ScopeEmpty({ scope }) {
  if (scope === "announced") {
    return (
      <OnboardingState
        eyebrow="Announced"
        title="No announced challenges yet."
        why="Upcoming challenges will be announced here with their dates. Meanwhile, the strongest preparation is a shipped project and steady progress on your path."
        action={<Link href="/student/projects" prefetch={false} className="btn-ghost">Work on a project</Link>}
      />
    );
  }
  if (scope === "past") {
    return (
      <OnboardingState
        eyebrow="Past"
        title="No past challenges yet."
        why="Finished challenges will archive here. Placements your chapter recognizes become part of your signed proof."
        action={<Link href="/student/credentials" prefetch={false} className="btn-ghost">See your proof</Link>}
      />
    );
  }
  return (
    <OnboardingState
      eyebrow="Challenges"
      title="No open challenges yet."
      why="Your college hasn't opened a challenge right now. The strongest preparation is a shipped project and steady progress on your path."
      action={<Link href="/student/projects" prefetch={false} className="btn-ghost">Work on a project</Link>}
    />
  );
}
