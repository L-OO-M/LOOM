"use client";

import Link from "next/link";
import Image from "next/image";

/**
 * Shared L.O.O.M. brand lockup — circular circuit badge + mono wordmark.
 * The badge is a cream disc, so it reads as a coin/seal on the dark theme
 * and blends into the warm background on the light theme.
 */
export function BrandMark({ size = 28, wordmark = true, href = "/", className = "" }) {
  const lockup = (
    <>
      <Image
        src="/logo.png"
        alt="L.O.O.M. logo"
        width={size}
        height={size}
        className="shrink-0 rounded-full"
        style={{ width: size, height: size, border: "1px solid var(--line)" }}
      />
      {wordmark && (
        <span className="font-mono text-sm font-semibold tracking-[0.2em]" style={{ color: "var(--text)" }}>
          L.O.O.M.
        </span>
      )}
    </>
  );

  if (!href) {
    return <span className={`inline-flex items-center gap-2.5 ${className}`}>{lockup}</span>;
  }

  return (
    <Link href={href} className={`inline-flex shrink-0 items-center gap-2.5 ${className}`} aria-label="L.O.O.M. home">
      {lockup}
    </Link>
  );
}
