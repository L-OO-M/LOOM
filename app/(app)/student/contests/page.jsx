import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, StatusPill } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";

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

export default async function ContestsPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/contests");
  const { user, tenant, sql } = ctx;
  const contests = await sql`
    SELECT * FROM contests WHERE tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL
    ORDER BY starts_at NULLS LAST, created_at DESC LIMIT 50
  `;
  const regs = await sql`SELECT contest_id FROM contest_registrations WHERE student_id = ${user.id}`;
  const regSet = new Set(regs.map((r) => r.contest_id));

  const live = contests.filter((c) => c.status === "open" || c.status === "published");
  const upcoming = contests.filter((c) => c.status === "upcoming" || c.status === "draft");
  const past = contests.filter((c) => !["open", "published", "upcoming", "draft"].includes(c.status));

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Meta>Prove · challenges with deadlines</Meta>
        <Display size="lg" className="mt-3">Earn it under pressure.</Display>

        {contests.length === 0 ? (
          <OnboardingState
            eyebrow="Challenges"
            title="No arena yet."
            why="Your college hasn't published a contest. Meanwhile, the strongest preparation is a shipped project and a steady commit streak."
            action={<Link href="/student/projects" className="btn-ghost">Work on a project</Link>}
          />
        ) : (
          <>
            {live.length > 0 && (
              <section className="mt-10" aria-label="Happening now">
                <Meta style={{ color: "var(--accent)" }}>Happening now · {live.length}</Meta>
                <ol className="mt-4">
                  {live.map((c) => <ContestRow key={c.id} c={c} registered={regSet.has(c.id)} />)}
                </ol>
              </section>
            )}
            {upcoming.length > 0 && (
              <section className="mt-12" aria-label="On the horizon">
                <Meta>On the horizon · {upcoming.length}</Meta>
                <ol className="mt-4">
                  {upcoming.map((c) => <ContestRow key={c.id} c={c} registered={regSet.has(c.id)} muted />)}
                </ol>
              </section>
            )}
            {past.length > 0 && (
              <section className="mt-12" aria-label="Past challenges">
                <Meta>Past · {past.length}</Meta>
                <ol className="mt-4 opacity-70">
                  {past.map((c) => <ContestRow key={c.id} c={c} registered={regSet.has(c.id)} muted />)}
                </ol>
              </section>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}

function ContestRow({ c, registered, muted }) {
  const u = urgency(c);
  return (
    <li className="border-b py-5 first:border-t" style={{ borderColor: "var(--line)" }}>
      <Link href={`/student/contests/${c.id}`} className="row-link flex items-start gap-4 px-2 py-1">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>{c.title}</span>
            {registered && <StatusPill tone="live">you're in</StatusPill>}
            {!muted && u && <StatusPill tone={u.tone}>{u.label}</StatusPill>}
          </span>
          {c.description && <span className="mt-1 line-clamp-2 block text-sm leading-6" style={{ color: "var(--text-muted)" }}>{c.description}</span>}
          <span className="meta mt-2 block">
            {c.status}
            {c.starts_at ? ` · starts ${new Date(c.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}` : ""}
            {muted && u ? ` · ${u.label.toLowerCase()}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-lg" style={{ color: "var(--text-muted)" }} aria-hidden="true">›</span>
      </Link>
    </li>
  );
}
