"use client";

import { useState } from "react";

export default function ShareButtons({ username, name, url, score }) {
  const [copied, setCopied] = useState(false);
  const text = `${name} on L.O.O.M. — Proof ${score} · @${username} · ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${name} — L.O.O.M.`, text, url });
        return;
      } catch {}
    }
    copy();
  }

  async function downloadStory() {
    const og = `${url}/opengraph-image?format=story`;
    try {
      const res = await fetch(og);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `loom-${username}-story.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(og, "_blank");
    }
  }

  async function downloadSquare() {
    const og = `${url}/opengraph-image`;
    try {
      const res = await fetch(og);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `loom-${username}-card.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(og, "_blank");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={share} className="btn-ink !py-2 text-sm">Share</button>
      <button onClick={copy} className="btn-ghost !py-2 text-sm">{copied ? "Copied ✓" : "Copy link"}</button>
      <button onClick={downloadStory} className="rounded-full border px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>Story 1080×1920</button>
      <button onClick={downloadSquare} className="rounded-full border px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>Card 1200×630</button>
    </div>
  );
}
