import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "@/lib/db";
import { verifyCredentialSignature } from "@/lib/credentials";
import { absoluteUrl } from "@/lib/seo";
import { BrandMark } from "@/components/BrandMark";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  // Route-derived, never query-derived: a transient DB error must not cost the
  // page its canonical. Without this export the page inherited the root
  // layout's canonical "/", telling Google every credential URL was the
  // homepage.
  const alternates = { canonical: absoluteUrl(`/verify/credential/${id}`) };
  try {
    const sql = getSql();
    const [cred] = await sql`
      SELECT v.title, v.credential_type, v.issued_at, p.name AS holder_name, t.name AS tenant_name
      FROM verifiable_credentials v
      LEFT JOIN profiles p ON p.user_id = v.student_id
      LEFT JOIN tenants t ON t.id = v.tenant_id
      WHERE v.id = ${id} LIMIT 1`;
    if (!cred) return { title: "Credential not found | L.O.O.M.", alternates };
    const holder = cred.holder_name || "a L.O.O.M. member";
    return {
      title: `${cred.title} — ${holder}`,
      description: `Verifiable credential issued by ${cred.tenant_name || "L.O.O.M."} to ${holder} on ${new Date(cred.issued_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Signature checked on this page.`,
      alternates,
      openGraph: { title: `${cred.title} — ${holder}`, description: `Verifiable credential from ${cred.tenant_name || "L.O.O.M."}.`, url: absoluteUrl(`/verify/credential/${id}`) },
      robots: { index: true, follow: true }
    };
  } catch {
    return { title: "Verifiable credential | L.O.O.M.", alternates };
  }
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4">
      <dt style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd className="text-right" style={{ color: "var(--text)" }}>{children}</dd>
    </div>
  );
}

export default async function VerifyCredentialPage({ params }) {
  const { id } = await params;
  const sql = getSql();
  // No tenant filter here meant any chapter could read any other chapter's
  // credential page. A verification link is the one thing that must stay
  // shareable, so scope on the credential's OWN tenant rather than the
  // request host -- the link has to work when forwarded off-site.
  const rows = await sql`
    SELECT v.*, p.name AS holder_name, t.name AS tenant_name
    FROM verifiable_credentials v
    LEFT JOIN profiles p ON p.user_id = v.student_id AND p.tenant_id = v.tenant_id
    LEFT JOIN tenants t ON t.id = v.tenant_id
    WHERE v.id = ${id}
    LIMIT 1
  `;
  const cred = rows[0] || null;
  if (!cred) notFound();
  const issuedAt = new Date(cred.issued_at).toISOString();
  const valid = verifyCredentialSignature({
    id: cred.id,
    studentId: cred.student_id,
    type: cred.credential_type,
    issuedAt,
    signature: cred.signature
  });
  const expired = cred.expires_at ? new Date(cred.expires_at).getTime() < Date.now() : false;
  const meta = cred.metadata || {};
  // Best-effort view log (never blocks verification display).
  try {
    await sql`INSERT INTO credential_views (credential_id) VALUES (${id})`;
    await sql`UPDATE verifiable_credentials SET view_count = view_count + 1, last_verified_at = now() WHERE id = ${id}`;
  } catch (e) {
    console.warn("credential view log failed", e ? String(e).slice(0, 120) : e);
  }
  const status = !valid ? "Invalid signature" : expired ? "Expired credential" : "Verified — issued by L.O.O.M.";
  const statusColor = valid && !expired ? "var(--accent)" : "var(--danger)";
  const issued = new Date(cred.issued_at).toLocaleDateString();
  const expires = cred.expires_at ? new Date(cred.expires_at).toLocaleDateString() : null;
  const views = (cred.view_count || 0) + 1;

  return (
    <main className="mx-auto max-w-xl px-4 py-12 sm:px-6" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
      <BrandMark size={28} />
      <p className="kicker mt-8">Verifiable credential</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{cred.title}</h1>
      <div className="mt-6 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        <dl className="space-y-3 text-sm">
          <Row label="Holder">{meta.holder || cred.holder_name || "L.O.O.M. student"}</Row>
          {cred.tenant_name ? <Row label="Chapter">{cred.tenant_name}</Row> : null}
          {meta.level ? <Row label="Level"><span className="capitalize">{meta.level}</span></Row> : null}
          <Row label="Issued">{issued}</Row>
          {expires ? <Row label="Expires">{expires}</Row> : null}
          {meta.evidence_url ? (
            <Row label="Evidence">
              <a href={meta.evidence_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>View</a>
            </Row>
          ) : null}
        </dl>
        <p className="mt-5 rounded-xl border px-3 py-2 text-center text-sm font-medium" style={{ borderColor: "var(--line)", color: statusColor, background: "var(--bg-muted)" }}>
          {status}
        </p>
      </div>
      <p className="mt-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
        Verify any credential at <Link href="/" style={{ color: "var(--accent)" }}>L.O.O.M.</Link> · {cred.id} · viewed {views} times
      </p>
    </main>
  );
}
