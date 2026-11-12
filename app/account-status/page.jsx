import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata = {
  title: "Account access | LOOM",
  description: "This account cannot open the chapter workspace right now.",
  robots: { index: false, follow: false }
};

const COPY = {
  suspended: {
    title: "This account is suspended.",
    body: "An admin paused access to the chapter workspace. Your profile, history, and contributions are intact. Ask a chapter admin to review the suspension; only they can restore access."
  },
  deactivated: {
    title: "This account is deactivated.",
    body: "This account has been closed for the chapter. Records and contributions stay in the ledger. A chapter admin can reactivate it through an explicit, audited action."
  }
};

export default async function AccountStatusPage({ searchParams }) {
  const sp = await searchParams;
  const state = sp?.state === "deactivated" ? "deactivated" : "suspended";
  const copy = COPY[state];

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-xl items-center px-5 py-16">
      <section className="w-full rounded-2xl border p-8" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--danger)" }}>
          <ShieldAlert size={14} aria-hidden="true" /> Access paused
        </p>
        <h1 className="mt-3 font-display text-3xl font-medium tracking-tight" style={{ color: "var(--text)" }}>
          {copy.title}
        </h1>
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
          {copy.body}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href="/auth/signout" className="btn-ink inline-flex items-center justify-center">
            Sign out
          </a>
          <Link href="/" prefetch={false} className="rounded-full border px-4 py-2 text-sm font-medium" style={{ borderColor: "var(--line)", color: "var(--text)" }}>
            Back to the public site
          </Link>
        </div>
      </section>
    </main>
  );
}
