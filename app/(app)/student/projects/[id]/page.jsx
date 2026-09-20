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
        <Meta>Build · Single project detail</Meta>
        <Link href="/student/projects" prefetch={false} className="meta mt-2 inline-block hover:underline" style={{ color: "var(--accent)" }}>← Projects</Link>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <Display size="lg" className="break-words">{p.title}</Display>
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${isVerified ? "is-live" : ""}`} style={isVerified ? { background: "var(--text)", color: "var(--bg)" } : { border: "1px solid var(--line)", color: "var(--text-muted)" }}><span className="grid size-4 place-items-center rounded-full" style={{ background: isVerified ? "var(--accent)" : "var(--line)", color: "#fff" }}>{isVerified ? "✓" : "·"}</span>{isVerified ? "Verified" : p.status}</span>
        </div>
        <p className="meta mt-3">{started && `started ${started}`} {updated && updated !== started && `· updated ${updated}`}</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
          <section aria-label="Project description" className="card-sheen rounded-[var(--radius-xl)] border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <Meta>Project description</Meta>
            <p className="narrative mt-3" style={{ color: "var(--text)" }}>{p.description || "No description yet — the work speaks first."}</p>
            {(p.tags || []).length > 0 && (
              <p className="mt-5 flex flex-wrap gap-2">
                {(p.tags || []).map((t) => {
                  const clean = String(t).toLowerCase().trim().replace(/\s+/g, "-");
                  return (
                    <Link
                      key={t}
                      href={`/student/projects?tag=${encodeURIComponent(clean)}`}
                      prefetch={false}
                      className="mono-tag rounded-full border px-2.5 py-1 hover:underline"
                      style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
                    >
                      #{clean}
                    </Link>
                  );
                })}
              </p>
            )}
            <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--line)" }}>
              <Meta>Collaborations</Meta>
              <div className="mt-3 flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full text-xs font-bold" style={{ background: "var(--bg-muted)", color: "var(--text)" }}>{String(profile?.full_name || p.owner_id).slice(0, 2).toUpperCase()}</span>
                <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{profile?.full_name || "Owner"}</span>
                <span className="mono-tag">owner</span>
              </div>
            </div>
          </section>

          <section aria-label="Proof status" className="card-sheen rounded-[var(--radius-xl)] border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <Meta>Proof status</Meta>
            <p className="mt-2 flex items-center gap-2 text-lg font-semibold" style={{ color: isVerified ? "var(--text)" : "var(--text-muted)" }}><span className="grid size-6 place-items-center rounded-full text-sm" style={{ background: isVerified ? "var(--text)" : "var(--line)", color: isVerified ? "var(--bg)" : "var(--text-muted)" }}>{isVerified ? "✓" : "·"}</span>{isVerified ? "Verified" : p.status}</p>
            <div className="mt-6">
              <Meta>GitHub repo</Meta>
              {p.repo_url ? (
                <a href={p.repo_url} target="_blank" rel="noreferrer" className="mt-2 block truncate font-mono text-xs hover:underline" style={{ color: "var(--text)" }}>{repoHost || p.repo_url} ↗</a>
              ) : (
                <p className="mono-tag mt-2">No repository linked yet.</p>
              )}
              {p.repo_url && <a href={p.repo_url} target="_blank" rel="noreferrer" className="btn-ghost mt-3 !py-1.5 text-xs w-fit">Open repository ↗</a>}
            </div>
            <div className="mt-6">
              <Meta>Commit timeline</Meta>
              <p className="mono-tag mt-2">{updated ? `updated ${updated}` : started ? `started ${started}` : "no commits yet"}</p>
              <p className="mono-tag">status · {p.status}</p>
            </div>
            <Link href={`/student/projects/${p.id}`} prefetch={false} className="btn-ink mt-6 w-full justify-center text-sm">View project</Link>
          </section>
        </div>

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
