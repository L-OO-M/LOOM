import Link from "next/link";
import { AppShell } from "@/components/AppShell";

/* A route that exists in the build but is switched off by a feature flag.
   These used to call notFound(), so a bookmark landed on "This page was never
   woven" — a lie, because the page exists and is simply not enabled yet. */
export function FeatureOff({ area, tenant, user, profile, title, body, backHref, backLabel }) {
  return (
    <AppShell area={area} tenant={tenant} user={user} profile={profile}>
      <div className="mx-auto max-w-xl py-12 text-center">
        <p className="meta" style={{ color: "var(--accent)" }}>Not switched on</p>
        <h1 className="font-display mt-3 text-3xl font-medium" style={{ color: "var(--text)" }}>{title}</h1>
        <p className="mx-auto mt-4 max-w-md leading-7" style={{ color: "var(--text-muted)" }}>{body}</p>
        <Link href={backHref} prefetch={false} className="btn-ink mt-7 inline-flex">{backLabel}</Link>
      </div>
    </AppShell>
  );
}
