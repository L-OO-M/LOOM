import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";

export default async function PrivacyPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/privacy");
  const { tenant, user, profile, sql } = ctx;
  const [card] = await sql`SELECT is_public FROM user_profiles WHERE user_id = ${user.id} LIMIT 1`;
  const [conn] = await sql`SELECT github_username FROM github_connections WHERE user_id = ${user.id} LIMIT 1`;

  const rows = [
    {
      label: "Public profile card",
      value: card ? (card.is_public ? "Public" : "Private") : "No card claimed",
      href: "/student/community",
      link: "Manage in Community",
      why: "Your discover card controls whether builders can find you by name, bio, and proof. Nothing else changes — your data stays in your college workspace either way."
    },
    {
      label: "GitHub linkage",
      value: conn?.github_username ? `Linked as ${conn.github_username}` : "Not linked",
      href: "/student/github",
      link: "Manage on GitHub",
      why: "Only your public username is stored — never tokens. Unlinking stops attribution; already-recorded activity stays as history."
    },
    {
      label: "Standings",
      value: "Participating",
      href: "/student/leaderboard",
      link: "See standings",
      why: "Rankings use counts, never content: commits, nodes, projects. Your name appears; your code doesn't."
    },
    {
      label: "College visibility",
      value: tenant?.name || "Your college",
      href: "/student/settings",
      link: "Membership in Settings",
      why: "Admins of your college can view progress for mentoring and operations. No cross-college access, ever — the server derives your college from your profile."
    }
  ];

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/student/settings" className="meta hover:underline" style={{ color: "var(--accent)" }}>← Settings</Link>
        <Meta className="mt-6">Trust · your data, your choices</Meta>
        <Display size="lg" className="mt-3">Privacy, as controls — not essays.</Display>

        <dl className="mt-10">
          {rows.map((r) => (
            <div key={r.label} className="border-b py-5 first:border-t" style={{ borderColor: "var(--line)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-[0.95rem] font-semibold" style={{ color: "var(--text)" }}>{r.label}</dt>
                <dd className="meta" style={{ color: "var(--text)" }}>{r.value}</dd>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                  Why this matters
                </summary>
                <p className="mt-2 max-w-xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>{r.why}</p>
                <Link href={r.href} className="mt-2 inline-block text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                  {r.link} →
                </Link>
              </details>
            </div>
          ))}
        </dl>

        <section className="mt-10" aria-label="What we store">
          <Meta>The fine print, in plain language</Meta>
          <ul className="mt-4 space-y-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            <li><strong style={{ color: "var(--text)" }}>Stored:</strong> profile fields you enter, roadmap and resource progress, projects, registrations, mentorship requests, linked GitHub usernames, webhook events.</li>
            <li><strong style={{ color: "var(--text)" }}>Never stored:</strong> passwords (Supabase Auth), GitHub tokens (OAuth isn't enabled), secrets. Audit logs record actions and ids — never request bodies.</li>
            <li><strong style={{ color: "var(--text)" }}>Deletion:</strong> edit or correct your profile anytime in Settings. Full deletion is manual and audited — ask your college admin.</li>
          </ul>
        </section>
      </main>
    </AppShell>
  );
}
