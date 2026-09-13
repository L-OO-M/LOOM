import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function CertificatePage({ params }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login");
  const { user, profile, tenant, sql } = ctx;
  const { code } = await params;

  const [cert] = await sql`
    SELECT c.*, p.name AS holder_name, t.name AS tenant_name, e.title AS event_title, e.starts_at
    FROM certificates c
    LEFT JOIN profiles p ON p.user_id = c.student_id
    LEFT JOIN tenants t ON t.id = c.tenant_id
    LEFT JOIN events e ON e.id = c.event_id
    WHERE c.verification_code = ${code}
    LIMIT 1
  `;
  if (!cert) notFound();
  // Privacy: the holder, or any admin of the issuing chapter, may view.
  if (cert.student_id !== user.id && profile?.role !== "admin") {
    return (
      <AppShell area="student" tenant={tenant} user={user}>
        <main className="mx-auto max-w-xl px-4 py-12 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>This certificate belongs to another student.</p>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border p-10 text-center" style={{ borderColor: "var(--accent)", background: "var(--bg-elevated)" }}>
          <p className="kicker">Certificate of participation</p>
          <h1 className="font-display mt-4 text-3xl font-medium" style={{ color: "var(--text)" }}>{cert.holder_name || "L.O.O.M. student"}</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            attended <span style={{ color: "var(--text)" }}>{cert.event_title || cert.title}</span>
            {cert.tenant_name ? <> at <span style={{ color: "var(--text)" }}>{cert.tenant_name}</span></> : null}
            {cert.starts_at ? <> on {new Date(cert.starts_at).toLocaleDateString("en-IN", { dateStyle: "long" })}</> : null}.
          </p>
          <p className="mt-6 font-mono text-xs" style={{ color: "var(--text-muted)" }}>Verify: {cert.verification_code} · issued {new Date(cert.issued_at).toLocaleDateString()}</p>
          <PrintButton />
        </div>
        <p className="mt-4 text-center text-xs print:hidden" style={{ color: "var(--text-muted)" }}>
          <Link href="/student/events" style={{ color: "var(--accent)" }}>← Back to events</Link>
        </p>
      </main>
    </AppShell>
  );
}
