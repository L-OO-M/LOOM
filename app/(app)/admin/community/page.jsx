import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Flag, BookOpen, Pin, EyeOff, Clock3 } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { HideButton, PinButton, WikiReviewButtons } from "./AdminCommunity";

export default async function AdminCommunityPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/community");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/community");
  const { tenant, user, sql } = ctx;
  const tid = tenant?.id ?? null;

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM forum_threads WHERE tenant_id = ${tid}::uuid AND flag_count > 0 AND status = 'visible') AS flagged_threads,
      (SELECT COUNT(*)::int FROM forum_replies r JOIN forum_threads t ON t.id = r.thread_id WHERE t.tenant_id = ${tid}::uuid AND r.flag_count > 0 AND r.status = 'visible') AS flagged_replies,
      (SELECT COUNT(*)::int FROM wiki_edit_requests e JOIN wiki_pages w ON w.id = e.page_id WHERE w.tenant_id = ${tid}::uuid AND e.status = 'pending') AS pending_edits,
      (SELECT COUNT(*)::int FROM forum_threads WHERE tenant_id = ${tid}::uuid AND pinned = true AND status = 'visible') AS pinned
  `;

  const flaggedThreads = await sql`
    SELECT t.id, t.title, t.flag_count, t.pinned, t.created_at, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.tenant_id = ${tid}::uuid AND t.flag_count > 0 AND t.status = 'visible'
    ORDER BY t.flag_count DESC LIMIT 20
  `;
  const flaggedReplies = await sql`
    SELECT r.id, r.body, r.flag_count, r.thread_id, p.name AS author_name FROM forum_replies r
    JOIN forum_threads t ON t.id = r.thread_id
    LEFT JOIN profiles p ON p.user_id = r.author_id
    WHERE t.tenant_id = ${tid}::uuid AND r.flag_count > 0 AND r.status = 'visible'
    ORDER BY r.flag_count DESC LIMIT 20
  `;
  const pendingEdits = await sql`
    SELECT e.*, w.title AS page_title, w.slug, p.name AS requester_name FROM wiki_edit_requests e
    JOIN wiki_pages w ON w.id = e.page_id
    LEFT JOIN profiles p ON p.user_id = e.requester_id
    WHERE w.tenant_id = ${tid}::uuid AND e.status = 'pending'
    ORDER BY e.created_at DESC LIMIT 20
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader kicker={`Trust · ${stats?.flagged_threads ?? 0} flagged threads · ${stats?.pending_edits ?? 0} wiki edits pending`} title="Community moderation" desc="Triage flags, curate featured threads, and review wiki suggestions. Every hide/pin is audited." />

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Flagged threads", value: stats?.flagged_threads ?? 0, icon: Flag, sub: "visible" },
            { label: "Flagged replies", value: stats?.flagged_replies ?? 0, icon: EyeOff, sub: "visible" },
            { label: "Wiki pending", value: stats?.pending_edits ?? 0, icon: BookOpen, sub: "suggestions" },
            { label: "Pinned", value: stats?.pinned ?? 0, icon: Pin, sub: "featured" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: s.label.includes("Flagged") && (s.value > 0) ? "color-mix(in srgb, var(--danger) 22%, transparent)" : "var(--line)", background: s.label.includes("Flagged") && s.value > 0 ? "color-mix(in srgb, var(--danger) 10%, var(--bg))" : "var(--bg)", color: s.label.includes("Flagged") && s.value > 0 ? "var(--danger)" : "var(--text-muted)" }}><s.icon size={14} /></span>
              <div><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{s.value}</p><p className="meta">{s.label} · {s.sub}</p></div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><Flag size={14} /> Flagged threads · {flaggedThreads.length}</h2>
            {flaggedThreads.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                <p className="narrative">Queue clear. {stats?.pinned ?? 0} pinned thread{(stats?.pinned ?? 0) === 1 ? "" : "s"} live — pin the best discussions to surface them.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {flaggedThreads.map((t) => (
                  <li key={t.id} className="group flex items-start justify-between gap-3 rounded-xl border p-3 transition hover:shadow-sm" style={{ borderColor: "color-mix(in srgb, var(--danger) 14%, var(--line))", background: "var(--bg)" }}>
                    <div className="min-w-0 flex-1">
                      <Link href={`/student/community/forums/${t.id}`} prefetch={false} className="block truncate text-sm font-medium hover:underline" style={{ color: "var(--text)" }}>{t.title}</Link>
                      <p className="meta mt-1 flex flex-wrap items-center gap-1.5">
                        <span>{t.author_name || "a student"}</span>
                        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5" style={{ borderColor: "color-mix(in srgb, var(--danger) 18%, transparent)", background: "color-mix(in srgb, var(--danger) 10%, var(--bg))", color: "var(--danger)" }}><Flag size={10} /> {t.flag_count} flags</span>
                        <span className="inline-flex items-center gap-1"><Clock3 size={10} /> {new Date(t.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                        {t.pinned && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", color: "var(--accent)" }}><Pin size={10} /> Pinned</span>}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5"><PinButton threadId={t.id} pinned={t.pinned} /><HideButton targetType="thread" targetId={t.id} /></span>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="mt-8 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><EyeOff size={14} /> Flagged replies · {flaggedReplies.length}</h2>
            {flaggedReplies.length === 0 ? (
              <p className="narrative mt-3">No flagged replies.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {flaggedReplies.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm leading-5" style={{ color: "var(--text)" }}>{r.body}</p>
                      <p className="meta mt-1">{r.author_name || "a student"} · {r.flag_count} flags · <Link href={`/student/community/forums/${r.thread_id}`} prefetch={false} style={{ color: "var(--accent)" }} className="hover:underline">thread →</Link></p>
                    </div>
                    <HideButton targetType="reply" targetId={r.id} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><BookOpen size={14} /> Wiki review queue · {pendingEdits.length}</h2>
            <p className="narrative mt-1">Approve to publish — the edit becomes the new version and the requester is credited.</p>
            {pendingEdits.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                <p className="narrative">No pending suggestions. Wiki edits from students land here.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {pendingEdits.map((e) => (
                  <li key={e.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                    <p className="text-sm" style={{ color: "var(--text)" }}>
                      <Link href={`/student/community/wiki/${e.slug}`} prefetch={false} className="font-medium hover:underline">{e.page_title}</Link>
                      <span style={{ color: "var(--text-muted)" }}> — {e.requester_name || "a student"}{e.reason ? `: ${e.reason}` : ""}</span>
                    </p>
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border p-3 font-mono text-xs" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{e.proposed_content.slice(0, 600)}</pre>
                    <div className="mt-2"><WikiReviewButtons slug={e.slug} editId={e.id} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
