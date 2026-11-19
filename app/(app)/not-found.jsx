import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { homeForRole } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

/* A 404 inside the workspace used to escape to app/not-found.jsx: public chrome,
   a "Sign in" card for a signed-in admin, and no way back to the console. This
   boundary keeps the reader inside AppShell and offers their own destinations.
   Public misses still land on the root not-found. */

export const dynamic = "force-dynamic";

const AREA_LINKS = {
  student: [
    ["Dashboard", "/student", "Today's next step"],
    ["Roadmap", "/student/roadmap", "Your track"],
    ["Resources", "/student/resources", "Reading and practice"],
    ["Events", "/student/events", "What's on"]
  ],
  lead: [
    ["Lead console", "/lead", "Chapter overview"],
    ["Events", "/lead/events", "Run the calendar"],
    ["Directory", "/lead/directory", "People and roles"],
    ["Assets", "/lead/assets", "Logos, decks, templates"]
  ],
  admin: [
    ["Admin overview", "/admin", "Chapter health"],
    ["Students", "/admin/students", "Roster and tiers"],
    ["Events", "/admin/events", "Calendar and attendance"],
    ["Resources", "/admin/resources", "Library"]
  ]
};

export default async function WorkspaceNotFound() {
  let ctx = null;
  try {
    ctx = await getRequestContext();
  } catch {
    ctx = null;
  }

  if (!ctx?.user) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-xl flex-col justify-center px-5 py-16" style={{ background: "var(--bg)" }}>
        <p className="kicker">404</p>
        <h1 className="font-display mt-3 text-3xl font-medium" style={{ color: "var(--text)" }}>That page isn&apos;t here.</h1>
        <p className="mt-4 leading-7" style={{ color: "var(--text-muted)" }}>
          This address belongs to the member workspace. Sign in and you can carry on from your own console.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/login" prefetch={false} className="btn-ink">Sign in</Link>
          <Link href="/" prefetch={false} className="btn-ghost">Back to LOOM</Link>
        </div>
      </main>
    );
  }

  const role = ctx.profile?.role;
  const area = role === "admin" || role === "platform_admin" ? "admin" : role === "dept_lead" || role === "vertical_lead" ? "lead" : "student";
  const home = homeForRole(role) || `/${area}`;
  const links = AREA_LINKS[area];

  return (
    <AppShell area={area} tenant={ctx.tenant} user={ctx.user} profile={ctx.profile}>
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="meta" style={{ color: "var(--accent)" }}>404</p>
        <h1 className="font-display mt-3 text-3xl font-medium sm:text-4xl" style={{ color: "var(--text)" }}>
          That page isn&apos;t in this console.
        </h1>
        <p className="mx-auto mt-4 max-w-lg leading-7" style={{ color: "var(--text-muted)" }}>
          The link is mistyped, moved, or belongs to a section your role can&apos;t open. You are signed in
          {ctx.user.email ? <> as <strong style={{ color: "var(--text)" }}>{ctx.user.email}</strong></> : null}, so nothing else is lost.
        </p>
        <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
          {links.map(([label, href, sub]) => (
            <Link key={href} href={href} prefetch={false} className="rounded-2xl border p-4 transition hover:-translate-y-0.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="block text-sm font-semibold" style={{ color: "var(--text)" }}>{label}</span>
              <span className="meta mt-0.5 block">{sub}</span>
            </Link>
          ))}
        </div>
        <Link href={home} prefetch={false} className="btn-ink mt-6 inline-flex">
          Back to your home
        </Link>
      </div>
    </AppShell>
  );
}
