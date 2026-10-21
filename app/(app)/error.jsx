"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Route-level error boundary for the whole app shell. Without this, a failed
// server render during navigation can leave the loading skeleton on screen
// forever — this surfaces the failure with a retry instead.
//
// The raw error message is logged to the console for diagnosis but NEVER
// rendered. It used to be shown to the user, which leaked Postgres internals
// into the browser: pooler host and port, constraint and column names, and the
// exact text of RLS denials — all of which describe the schema and the trust
// boundary to anyone who triggers an error.
//
// The fallback used to hardcode /student, so an admin or lead who hit a broken
// page was silently dumped into the member surface. The destination now follows
// the area the failure happened in.
function homeForPath(pathname) {
  if (pathname.startsWith("/admin")) return { href: "/admin", label: "Back to Overview" };
  if (pathname.startsWith("/lead")) return { href: "/lead", label: "Back to Console" };
  return { href: "/student", label: "Back to Today" };
}

export default function AppError({ error, reset }) {
  console.error("[app] route render failed:", error);
  const home = homeForPath(usePathname() || "");

  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-28 text-center sm:px-6">
      <p className="font-mono text-xs tracking-[0.25em]" style={{ color: "var(--accent)" }}>
        SOMETHING SNAGGED A THREAD
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
        This page didn&rsquo;t load
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        The request didn&rsquo;t make it back. Your work is safe — this is a loading hiccup,
        not lost data.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button type="button" onClick={() => reset()} className="btn-ink">
          Try again
        </button>
        <Link href={home.href} prefetch={false} className="btn-ghost">
          {home.label}
        </Link>
      </div>
    </div>
  );
}
