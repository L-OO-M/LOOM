import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "@/lib/db";
import { JsonLd, breadcrumbSchema } from "@/components/seo/JsonLd";
import { absoluteUrl } from "@/lib/seo";
import { BrandMark } from "@/components/BrandMark";

export const dynamic = "force-dynamic";

// Public certificate verification. Mirrors /verify/credential/[id]: the whole
// point is that a shared link works off-site, with no login and no request
// tenant — so this reads the certificate by its own verification_code and scopes
// on the certificate's OWN tenant, exactly like the credential verifier.
// The unguessable verification_code is the capability: whoever holds the link
// may confirm it, and nothing beyond the issuing chapter's public assertion
// (holder, event, chapter, date) is exposed.
export async function generateMetadata({ params }) {
  const { code } = await params;
  const alternates = { canonical: absoluteUrl(`/verify/certificate/${code}`) };
  try {
    const sql = getSql();
    const [cert] = await sql`
      SELECT c.title, c.issued_at, p.name AS holder_name, t.name AS tenant_name, e.title AS event_title
      FROM certificates c
      LEFT JOIN profiles p ON p.user_id = c.student_id AND p.tenant_id = c.tenant_id
      LEFT JOIN tenants t ON t.id = c.tenant_id
      LEFT JOIN events e ON e.id = c.event_id
      WHERE c.verification_code = ${code} LIMIT 1`;
    if (!cert) return { title: "Certificate not found | L.O.O.M.", alternates };
    const holder = cert.holder_name || "a L.O.O.M. member";
    const what = cert.event_title || cert.title;
    return {
      title: `Certificate — ${holder}`,
      description: `Participation certificate for ${holder} — ${what}, issued by ${cert.tenant_name || "L.O.O.M."}. Verification code ${code}.`,
      alternates,
      openGraph: { title: `Certificate — ${holder}`, description: `Participation certificate from ${cert.tenant_name || "L.O.O.M."}.`, url: absoluteUrl(`/verify/certificate/${code}`) },
      robots: { index: true, follow: true }
    };
  } catch {
    return { title: "Certificate | L.O.O.M.", alternates };
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

export default async function VerifyCertificatePage({ params }) {
  const { code } = await params;
  const sql = getSql();
  const rows = await sql`
    SELECT c.*, p.name AS holder_name, t.name AS tenant_name, e.title AS event_title, e.starts_at
    FROM certificates c
    LEFT JOIN profiles p ON p.user_id = c.student_id AND p.tenant_id = c.tenant_id
    LEFT JOIN tenants t ON t.id = c.tenant_id
    LEFT JOIN events e ON e.id = c.event_id
    WHERE c.verification_code = ${code}
    LIMIT 1
  `;
  const cert = rows[0] || null;
  if (!cert) notFound();
  const issued = new Date(cert.issued_at).toLocaleDateString();
  const heldOn = cert.starts_at ? new Date(cert.starts_at).toLocaleDateString("en-IN", { dateStyle: "long" }) : null;

  return (
    <main className="mx-auto max-w-xl px-4 py-12 sm:px-6" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", url: absoluteUrl("/") },
          { name: "Certificate", url: absoluteUrl(`/verify/certificate/${code}`) }
        ])}
      />
      <BrandMark size={28} />
      <p className="kicker mt-8">Certificate of participation</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{cert.holder_name || "L.O.O.M. student"}</h1>
      <div className="mt-6 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        <dl className="space-y-3 text-sm">
          <Row label="Event">{cert.event_title || cert.title}</Row>
          {cert.tenant_name ? <Row label="Chapter">{cert.tenant_name}</Row> : null}
          {heldOn ? <Row label="Held">{heldOn}</Row> : null}
          <Row label="Issued">{issued}</Row>
          <Row label="Code"><span className="font-mono text-xs">{cert.verification_code}</span></Row>
        </dl>
        <p className="mt-5 rounded-xl border px-3 py-2 text-center text-sm font-medium" style={{ borderColor: "var(--line)", color: "var(--accent)", background: "var(--bg-muted)" }}>
          Verified — issued by L.O.O.M.
        </p>
      </div>
      <p className="mt-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
        Verify any certificate at <Link href="/" style={{ color: "var(--accent)" }}>L.O.O.M.</Link> · {cert.verification_code}
      </p>
    </main>
  );
}
