import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { NewPageForm } from "./WikiBits";

export const dynamic = "force-dynamic";

export default async function WikiListPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/community/wiki");
  const { tenant, user, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();

  const pages = await sql`
    SELECT w.*, p.name AS author_name FROM wiki_pages w
    LEFT JOIN profiles p ON p.user_id = w.author_id
    WHERE w.tenant_id = ${tenant?.id ?? null}::uuid AND w.status = 'published'
      AND (${q} = '' OR (w.title ILIKE ${`%${q}%`} OR w.content ILIKE ${`%${q}%`}))
    ORDER BY w.updated_at DESC LIMIT 50
  `;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/student/community" style={{ color: "var(--accent)" }}>← Community</Link>
        </p>
        <PageHeader kicker="Knowledge" title="Wiki" desc="Your chapter's living handbook." action={<NewPageForm />} />
        <form method="get" className="flex gap-2">
          <input name="q" defaultValue={sp?.q || ""} placeholder="Search pages…" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }} />
          <button className="btn-ink" type="submit">Search</button>
        </form>
        {pages.length === 0 ? (
          <div className="mt-4"><EmptyState title="No pages yet" body="Document your chapter's hard-won knowledge — setup guides, DSA tips, deployment gotchas." /></div>
        ) : (
          <ul className="mt-4 space-y-3">
            {pages.map((w) => (
              <li key={w.id}>
                <Link href={`/student/community/wiki/${w.slug}`}>
                  <Card>
                    <p className="font-medium" style={{ color: "var(--text)" }}>{w.title}</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      {w.domain} · v{w.version} · {w.view_count} views · by {w.author_name || "a student"}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
