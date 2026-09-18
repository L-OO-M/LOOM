import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, StatusPill, ActionLink } from "@/components/loom/primitives";
import ProjectStatusControl from "../_components/ProjectStatusControl";
import ProjectEditForm from "../_components/ProjectEditForm";

function pillTone(status) {
  if (status === "active") return "live";
  if (status === "completed") return "solid";
  return "";
}

function fmt(date) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" });
}

export default async function ProjectDetailPage({ params }) {
  const { id } = await params;
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=/student/projects/${id}`);
  const { user, profile, tenant, sql } = ctx;
  const [p] = await sql`SELECT * FROM projects WHERE id = ${id} LIMIT 1`;
  if (!p) notFound();
  // Tenant isolation: a project from another tenant must not be visible,
  // even to an admin who guesses the UUID. Same-tenant admins keep review access.
  const sameTenant = !p.tenant_id || !tenant?.id || p.tenant_id === tenant.id;
  if (!sameTenant) notFound();
  const isOwner = p.owner_id === user.id;
  const isAdmin = profile.role === "admin";
  if (!isOwner && !isAdmin) redirect("/student/projects");

  const [node] = p.roadmap_node_id
    ? await sql`SELECT id, title FROM roadmap_nodes WHERE id = ${p.roadmap_node_id} LIMIT 1`
    : [null];
  const milestones = isOwner
    ? await sql`SELECT id, title FROM roadmap_nodes ORDER BY sort_order ASC LIMIT 100`
    : [];

  const started = fmt(p.created_at);
  const updated = fmt(p.updated_at);
  const repoHost = (() => {
    try {
      return p.repo_url ? new URL(p.repo_url).hostname.replace(/^www\./, "") : null;
    } catch {
      return null;
    }
  })();

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/student/projects" prefetch={false} className="meta hover:underline" style={{ color: "var(--accent)" }}>← Projects</Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusPill tone={pillTone(p.status)}>{p.status}</StatusPill>
          {started && <span className="meta">started {started}</span>}
          {updated && updated !== started && <span className="meta">· updated {updated}</span>}
        </div>
        <Display size="lg" className="mt-3 break-words">{p.title}</Display>
        <p className="lede mt-4">{p.description || "No description yet — the work speaks first."}</p>

        {(p.tags || []).length > 0 && (
          <p className="mt-5 flex flex-wrap gap-2">
            {(p.tags || []).map((t) => (
              <Link
                key={t}
                href={`/student/projects?tag=${encodeURIComponent(String(t).toLowerCase())}`}
                prefetch={false}
                className="rounded-full border px-2.5 py-0.5 font-mono text-xs hover:underline"
                style={{ borderColor: "var(--line)", color: "var(--accent)" }}
              >
                #{t}
              </Link>
            ))}
          </p>
        )}

        <section aria-label="Repository" className="mt-8 border-y py-6" style={{ borderColor: "var(--line)" }}>
          <Meta>Repository</Meta>
          {p.repo_url ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <a
                href={p.repo_url}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost !py-2 text-sm"
              >
                Open repository{repoHost ? ` on ${repoHost}` : ""} ↗
              </a>
              <span className="block w-full truncate font-mono text-xs" style={{ color: "var(--text-muted)" }}>{p.repo_url}</span>
            </div>
          ) : (
            <p className="narrative mt-2">No repository linked yet. {isOwner ? "Add one below so the code is one click away." : ""}</p>
          )}
        </section>

        {node && (
          <p className="mt-6 text-sm" style={{ color: "var(--text-muted)" }}>
            Grows from milestone: <Link href={`/student/roadmap/${node.id}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>{node.title}</Link>
          </p>
        )}

        {isOwner && (
          <>
            <section aria-label="Track status" className="mt-8">
              <Meta>Track · move it through the lifecycle</Meta>
              <div className="mt-3">
                <ProjectStatusControl projectId={p.id} current={p.status} />
              </div>
              <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                Active while you build · Completed when it&apos;s real and running · Archived when shelved.
              </p>
            </section>

            <details className="mt-8 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--text)" }}>
                Edit project details
              </summary>
              <div className="mt-4">
                <ProjectEditForm project={p} milestones={milestones} />
              </div>
            </details>
          </>
        )}

        <div className="mt-10 flex flex-wrap justify-between gap-3 border-t pt-6" style={{ borderColor: "var(--line)" }}>
          <ActionLink href="/student/github">Link activity on GitHub</ActionLink>
          <ActionLink href="/student/credentials">Next step: turn shipped work into proof</ActionLink>
        </div>
        <p className="meta mt-3">Proof is a separate step — projects don&apos;t appear in the ledger until you claim them as credentials.</p>
      </main>
    </AppShell>
  );
}
