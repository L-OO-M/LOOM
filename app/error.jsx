"use client";

import Link from "next/link";
import { useEffect } from "react";

/* Root error boundary: any malfunction inside the app lands here instead of
   a blank screen or a stack trace. Plain language, a way back, a retry. */
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("LOOM error boundary:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center px-5 py-16 text-center" style={{ background: "var(--bg)" }}>
      <p className="kicker">A thread snapped</p>
      <h1 className="font-display mt-4 text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
        Something broke on our side.
      </h1>
      <p className="mt-5 max-w-md leading-7" style={{ color: "var(--text-muted)" }}>
        The page hit an unexpected error and stopped rather than show you something half-rendered.
        Your work is safe — nothing you submitted was lost to this screen.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button onClick={() => reset()} className="btn-ink justify-center !px-6 !py-3">
          Try again
        </button>
        <Link href="/" prefetch={false} className="justify-center !px-6 !py-3 !text-base font-semibold transition hover:opacity-85" style={{ color: "var(--text)", border: "1px solid var(--line)", borderRadius: 10 }}>
          Back home
        </Link>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm" style={{ color: "var(--text-muted)" }}>
        <Link prefetch={false} href="/student" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Dashboard</Link>
        <Link prefetch={false} href="/faq" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>FAQ</Link>
        <Link prefetch={false} href="/login" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Sign in</Link>
      </div>
    </main>
  );
}
