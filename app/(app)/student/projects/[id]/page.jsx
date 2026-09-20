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

  const isVerified = p.status === "completed";
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        <Link href="/student/projects" prefetch={false} className="meta hover:underline" style={{ color: "var(--accent)" }}>← Projects</Link>
        <p className="meta mt-4">{started && `started ${started}`} {updated && updated !== started && `· updated ${updated}`} · <span style={{ color: isVerified ? "var(--accent)" : "var(--text-muted)" }}>{isVerified ? "Verified" : p.status}</span></p>
        <h1 className="display display-lg mt-2 break-words" style={{ color: "var(--text)" }}>{p.title}</h1>
        {(p.tags || []).length > 0 && (
          <p className="mt-3 flex flex-wrap gap-2">
            {(p.tags || []).map((t) => {
              const clean = String(t).toLowerCase().trim().replace(/\s+/g, "-");
              return (
                <Link key={t} href={`/student/projects?tag=${encodeURIComponent(clean)}`} prefetch={false} className="mono-tag rounded-full border px-2.5 py-1 hover:underline" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>#{clean}</Link>
              );
            })}
          </p>
        )}

        {/* CASE STUDY — editorial, not two equal cards */}
        <div className="mt-8">
          <p className="kicker">Case study</p>
          <div className="mt-6 grid gap-10 lg:grid-cols-[1.5fr_0.9fr]">
            <div className="min-w-0">
              <section aria-label="The problem">
                <h2 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>The problem</h2>
                <p className="narrative mt-3" style={{ color: "var(--text)" }}>{p.description || "The work speaks first — describe the problem this project solves and why it matters."}</p>
              </section>
              <section className="mt-8" aria-label="The solution">
                <h2 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>The solution</h2>
                <p className="narrative mt-3">Built as a focused, shippable piece of work. The repository holds the decisions — this page holds the narrative.</p>
                {p.repo_url && (
                  <a href={p.repo_url} target="_blank" rel="noreferrer" className="mt-3 inline-block font-mono text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>{repoHost || p.repo_url} ↗</a>
                )}
              </section>
              <section className="mt-8" aria-label="Architecture">
                <h2 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>Architecture</h2>
                <div className="mt-3 rounded-xl border px-4 py-6" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
                  <p className="meta">Stack</p>
                  <p className="mt-2 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{(p.tags || []).join(" · ") || "tags describe the stack"}</p>
                  <p className="meta mt-4">Timeline</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--text)" }}>{started || "—"} → {updated || "now"} · {p.status}</p>
                </div>
              </section>
              {node && (
                <p className="mt-8 text-sm" style={{ color: "var(--text-muted)" }}>
                  Grows from milestone <Link href={`/student/roadmap/${node.id}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>{node.title}</Link> — roadmap → project → proof.
                </p>
              )}
            </div>
            <aside className="min-w-0 space-y-6" aria-label="Proof and actions">
              <div className="rounded-2xl border p-5" style={{ borderColor: isVerified ? "var(--accent)" : "var(--line)", background: "var(--bg-elevated)" }}>
                <Meta>Proof status</Meta>
                <p className="mt-2 flex items-center gap-2 text-lg font-semibold" style={{ color: "var(--text)" }}><span className="grid size-6 place-items-center rounded-full text-sm" style={{ background: isVerified ? "var(--accent)" : "var(--line)", color: isVerified ? "#101314" : "var(--text-muted)" }}>{isVerified ? "✓" : "·"}</span>{isVerified ? "Verified" : p.status}</p>
                <p className="meta mt-2">{isVerified ? "Shipped and verifiable" : "Build → complete → prove"}</p>
              </div>
              <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <Meta>Repository</Meta>
                {p.repo_url ? (
                  <>
                    <a href={p.repo_url} target="_blank" rel="noreferrer" className="mt-2 block truncate font-mono text-sm hover:underline" style={{ color: "var(--text)" }}>{repoHost || p.repo_url} ↗</a>
                    <a href={p.repo_url} target="_blank" rel="noreferrer" className="btn-ghost mt-3 w-full justify-center !py-2 text-xs">Open repository ↗</a>
                  </>
                ) : (
                  <p className="meta mt-2">No repository linked yet — add one in Edit below.</p>
                )}
              </div>
              <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <Meta>Lifecycle</Meta>
                {isOwner ? (
                  <>
                    <div className="mt-3"><ProjectStatusControl projectId={p.id} current={p.status} /></div>
                    <p className="meta mt-2">Active → Completed → Archived. Proof is claimed separately in Credentials.</p>
                  </>
                ) : (
                  <p className="meta mt-2">Only the owner can move this through its lifecycle.</p>
                )}
              </div>
            </aside>
          </div>
        </div>

        {isOwner && (
          <details className="mt-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--text)" }}>Edit project details</summary>
            <div className="mt-4"><ProjectEditForm project={p} milestones={milestones} /></div>
          </details>
        )}

        <div className="mt-10 flex flex-wrap justify-between gap-3 border-t pt-6" style={{ borderColor: "var(--line)" }}>
          <ActionLink href="/student/github">Link activity on GitHub</ActionLink>
          <ActionLink href="/student/credentials">Next: turn shipped work into proof</ActionLink>
        </div>
      </main>
    </AppShell>
  );
}
