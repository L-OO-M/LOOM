import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, ActionLink } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";

export default async function ProjectsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/projects");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const tag = (sp?.tag || "").trim().toLowerCase();

  const rows = await sql`SELECT * FROM projects WHERE owner_id = ${user.id} ORDER BY created_at DESC LIMIT 50`;
  const allTags = [...new Set(rows.flatMap((p) => p.tags || []))].sort();
  const visible = tag ? rows.filter((p) => (p.tags || []).includes(tag)) : rows;
  const [featured, ...rest] = visible;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Meta>Build · workspace & portfolio</Meta>
            <Display size="lg" className="mt-3">Shipped work.</Display>
          </div>
          <Link href="/student/projects/new" className="btn-ink">New project</Link>
        </div>

        {allTags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2" aria-label="Filter by tag">
            <TagLink href="/student/projects" active={!tag}>All</TagLink>
            {allTags.map((t) => (
              <TagLink key={t} href={`/student/projects?tag=${encodeURIComponent(t)}`} active={tag === t}>#{t}</TagLink>
            ))}
          </div>
        )}

        {visible.length === 0 ? (
          <OnboardingState
            eyebrow={tag ? "No matches" : "Portfolio"}
            title={tag ? `Nothing tagged #${tag}.` : "Proof beats progress."}
            why={tag ? "Clear the filter to see everything you've shipped." : "Publish something small this week — a page, a script, a fix. Projects linked to repos and roadmap nodes become the strongest part of your proof."}
            action={<Link href="/student/projects/new" className="btn-ink">Create your first project →</Link>}
          />
        ) : (
          <>
            {featured && !tag && (
              <Link href={`/student/projects/${featured.id}`} className="row-link mt-10 block border-y py-8" style={{ borderColor: "var(--line)" }}>
                <Meta style={{ color: "var(--accent)" }}>Latest · {featured.status}</Meta>
                <p className="display display-md mt-3">{featured.title}</p>
                {featured.description && <p className="narrative mt-3" style={{ color: "var(--text)" }}>{featured.description}</p>}
                <p className="meta mt-4">
                  {(featured.tags || []).map((t) => `#${t}`).join("  ") || "untagged"}
                  {featured.repo_url ? "  ·  repo linked" : ""}
                </p>
              </Link>
            )}
            <ol className="mt-2">
              {(tag ? visible : rest).map((p, i) => (
                <li key={p.id} className="border-b py-5" style={{ borderColor: "var(--line)" }}>
                  <Link href={`/student/projects/${p.id}`} className="row-link flex items-baseline gap-5 px-2 py-1">
                    <span className="index-num shrink-0">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>{p.title}</span>
                      <span className="mt-1 block truncate text-sm" style={{ color: "var(--text-muted)" }}>
                        {p.description || "No description yet"}
                      </span>
                    </span>
                    <span className="meta shrink-0 text-right">
                      {p.status}
                      {p.repo_url ? " · repo" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex justify-between">
              <ActionLink href="/student/github">Link activity on GitHub</ActionLink>
              <ActionLink href="/student/credentials">Turn work into proof</ActionLink>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}

function TagLink({ href, active, children }) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className="rounded-full px-3.5 py-1 font-mono text-xs transition active:scale-[0.97]"
      style={active
        ? { background: "var(--text)", color: "var(--bg)" }
        : { background: "transparent", color: "var(--text-muted)", border: "1px solid var(--line)" }}
    >
      {children}
    </Link>
  );
}
