import Link from "next/link";
import { redirect } from "next/navigation";
import { Flag, BookOpen, Pin, EyeOff, Clock3 } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { HideButton, PinButton, WikiReviewButtons } from "./AdminCommunity";
import "../_components/admin-ledger.css";

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

  // Hidden content is listed too, so a moderation decision is reversible from
  // the UI. Previously every query filtered status='visible', which meant a hide
  // was permanent: the API accepted `visible` but nothing rendered the control.
  const hiddenThreads = await sql`
    SELECT t.id, t.title, t.status, t.pinned, t.created_at, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.tenant_id = ${tid}::uuid AND t.status = 'hidden'
    ORDER BY t.created_at DESC LIMIT 20
  `;
  const hiddenReplies = await sql`
    SELECT r.id, r.body, r.thread_id, p.name AS author_name FROM forum_replies r
    JOIN forum_threads t ON t.id = r.thread_id
    LEFT JOIN profiles p ON p.user_id = r.author_id
    WHERE t.tenant_id = ${tid}::uuid AND r.status = 'hidden'
    ORDER BY r.created_at DESC LIMIT 20
  `;
  const hiddenSnippets = await sql`
    SELECT s.id, s.title, s.language FROM code_snippets s
    WHERE s.status = 'hidden' AND s.tenant_id = ${tid}::uuid
    ORDER BY s.created_at DESC LIMIT 20
  `;

  const hiddenTotal = hiddenThreads.length + hiddenReplies.length + hiddenSnippets.length;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Trust / ${stats?.flagged_threads ?? 0} flagged threads / ${stats?.pending_edits ?? 0} wiki edits pending`}
          title="Community moderation"
          lede="Triage flags, curate featured threads, and review wiki suggestions. Every hide and pin is audited."
          meta={`${flaggedThreads.length} flagged threads in view / ${pendingEdits.length} pending suggestions / ${hiddenTotal} hidden items`}
          tone="field"
          art="/domains-art/domain-creative.png"
          artAlt=""
          stats={[
            { value: stats?.flagged_threads ?? 0, label: "flagged threads" },
            { value: stats?.flagged_replies ?? 0, label: "flagged replies" },
            { value: stats?.pending_edits ?? 0, label: "wiki suggestions" },
            { value: stats?.pinned ?? 0, label: "pinned threads" }
          ]}
        />

        <WorkspaceSection index="01" title="Flagged threads" note="Newest signal first — pin the best discussions or hide content that breaks the code." action={<span className="aled-meta">{flaggedThreads.length} in view</span>}>
          {flaggedThreads.length === 0 ? (
            <WorkspaceEmpty
              title="Queue clear"
              body={`${stats?.pinned ?? 0} pinned thread${(stats?.pinned ?? 0) === 1 ? "" : "s"} live — pin the best discussions to surface them.`}
            />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {flaggedThreads.map((t) => (
                <li key={t.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                  <div className="aled-copy">
                    <Link href={`/student/community/forums/${t.id}`} prefetch={false} className="aled-title">{t.title}</Link>
                    <p className="aled-sub" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem 0.65rem" }}>
                      <span>{t.author_name || "a student"}</span>
                      <span className="aled-tag aled-tag--danger"><Flag size={10} aria-hidden="true" /> {t.flag_count} flags</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><Clock3 size={10} aria-hidden="true" /> {new Date(t.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                      {t.pinned && <span className="aled-tag aled-tag--accent"><Pin size={10} aria-hidden="true" /> Pinned</span>}
                    </p>
                  </div>
                  <span className="aled-actions"><PinButton threadId={t.id} pinned={t.pinned} /><HideButton targetType="thread" targetId={t.id} /></span>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>

        <WorkspaceSection index="02" title="Flagged replies" note="Reply-level flags stay visible until a moderator makes a decision." action={<span className="aled-meta">{flaggedReplies.length} in view</span>}>
          {flaggedReplies.length === 0 ? (
            <WorkspaceEmpty title="No flagged replies" body="Replies flagged by students will appear here." />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {flaggedReplies.map((r) => (
                <li key={r.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                  <div className="aled-copy">
                    <p className="aled-body">{r.body}</p>
                    <p className="aled-sub">
                      {r.author_name || "a student"} / {r.flag_count} flags / <Link href={`/student/community/forums/${r.thread_id}`} prefetch={false}>thread →</Link>
                    </p>
                  </div>
                  <span className="aled-actions"><HideButton targetType="reply" targetId={r.id} /></span>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>

        <WorkspaceSection index="03" title="Wiki review queue" note="Approve to publish — the edit becomes the new version and the requester is credited." action={<span className="aled-meta">{pendingEdits.length} pending</span>}>
          {pendingEdits.length === 0 ? (
            <WorkspaceEmpty title="No pending suggestions" body="Wiki edits from students land here for review." />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {pendingEdits.map((e) => (
                <li key={e.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr)" }}>
                  <div className="aled-copy">
                    <p className="aled-body">
                      <Link href={`/student/community/wiki/${e.slug}`} prefetch={false}>{e.page_title}</Link>
                      <span style={{ color: "var(--text-muted)" }}> — {e.requester_name || "a student"}{e.reason ? `: ${e.reason}` : ""}</span>
                    </p>
                    <pre className="aled-code">{e.proposed_content.slice(0, 600)}</pre>
                    <div className="aled-actions" style={{ justifyContent: "flex-start", marginTop: "0.65rem" }}><WikiReviewButtons slug={e.slug} editId={e.id} /></div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>

        <WorkspaceSection index="04" title="Hidden content" note="Everything you have hidden, with the control to bring it back. Moderation is reversible — nothing is deleted." action={<span className="aled-meta">{hiddenTotal} hidden</span>}>
          {hiddenTotal === 0 ? (
            <WorkspaceEmpty title="Nothing is currently hidden" body="Hidden threads, replies, and snippets will be listed here for restoration." />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {hiddenThreads.map((t) => (
                <li key={`t-${t.id}`} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                  <div className="aled-copy">
                    <span className="aled-title" style={{ color: "var(--text-muted)" }}>{t.title}</span>
                    <p className="aled-sub">Hidden thread / {t.author_name || "a student"}</p>
                  </div>
                  <span className="aled-actions"><HideButton targetType="thread" targetId={t.id} status="visible" /></span>
                </li>
              ))}
              {hiddenReplies.map((r) => (
                <li key={`r-${r.id}`} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                  <div className="aled-copy">
                    <p className="aled-body" style={{ color: "var(--text-muted)" }}>{r.body}</p>
                    <p className="aled-sub">Hidden reply / {r.author_name || "a student"} / <Link href={`/student/community/forums/${r.thread_id}`} prefetch={false}>thread →</Link></p>
                  </div>
                  <span className="aled-actions"><HideButton targetType="reply" targetId={r.id} status="visible" /></span>
                </li>
              ))}
              {hiddenSnippets.map((s) => (
                <li key={`s-${s.id}`} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                  <div className="aled-copy">
                    <span className="aled-title" style={{ color: "var(--text-muted)" }}>{s.title || "Untitled snippet"}</span>
                    <p className="aled-sub">Hidden snippet / {s.language || "text"}</p>
                  </div>
                  <span className="aled-actions"><HideButton targetType="snippet" targetId={s.id} status="visible" /></span>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
