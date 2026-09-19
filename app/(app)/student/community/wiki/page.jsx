import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";
import { NewPageForm } from "./WikiBits";

export const dynamic = "force-dynamic";

function dateLabel(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

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
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Link href="/student/community" prefetch={false} className="meta hover:underline" style={{ color: "var(--accent)" }}>← Community</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Meta>Room 02 · the chapter&apos;s memory</Meta>
            <Display size="lg" className="mt-3">Wiki.</Display>
            <p className="mt-2 max-w-xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              Document something → improve it → preserve it. Durable pages, reviewed edits.
            </p>
          </div>
          <NewPageForm />
        </div>
        <form method="get" className="mt-7 flex gap-2">
          <input name="q" defaultValue={sp?.q || ""} placeholder="Search the handbook…" aria-label="Search wiki" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }} />
          <button className="btn-ink !py-2" type="submit">Search</button>
        </form>
        {pages.length === 0 ? (
          <p className="narrative mt-8">No pages yet. Document the setup guide you wish you&apos;d had — deployment gotchas, DSA patterns, environment fixes.</p>
        ) : (
          <>
            <p className="meta mt-8">{pages.length} pages · curiosity, archived</p>
            <ol className="mt-3">
              {pages.map((w, i) => (
                <li key={w.id} className="border-b py-4 first:border-t" style={{ borderColor: "var(--line)" }}>
                  <Link href={`/student/community/wiki/${w.slug}`} prefetch={false} className="row-link flex flex-wrap items-baseline gap-x-4 gap-y-1 px-2 py-1">
                    <span className="index-num shrink-0">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 basis-48 truncate text-[0.98rem] font-semibold" style={{ color: "var(--text)" }}>{w.title}</span>
                    <span className="meta shrink-0">{w.domain} · v{w.version} · {w.view_count} reads · {w.author_name || "a student"} · {dateLabel(w.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      </main>
    </AppShell>
  );
}
