"use client";

import { useState } from "react";

/**
 * Share a builder card.
 *
 * The point of this sheet is that you SEE the card before you share it. The
 * previous version was four bare buttons -- Share / Copy link / Story / Card --
 * which told you nothing about what a recipient would actually get. Here the
 * rendered card is previewed inline, and the image itself can be copied to the
 * clipboard (not just linked), because pasting a picture into a Discord or
 * WhatsApp thread is how most people actually share proof.
 *
 * Preview and download hit the same endpoint the recipient's unfurl uses, so
 * what is previewed is exactly what is shared.
 */
export default function ShareButtons({ username, name, url, score = 0, data }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const [format, setFormat] = useState("feed");

  // Path-based, not ?format= -- metadata image routes are cached by pathname,
  // so a query string was silently ignored and every "size" button produced the
  // same 1200x630 file.
  const cardBase = `${url.replace(/\/$/, "")}/card`;
  const ogUrl = `${cardBase}/${format}`;
  const text = `${name} on L.O.O.M. — proof, projects and reputation. ${url}`;

  function flash(msg) {
    setCopied(msg);
    setTimeout(() => setCopied(""), 2200);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied");
    } catch {
      flash("Copy failed");
    }
  }

  async function copyImage() {
    try {
      const res = await fetch(ogUrl);
      if (!res.ok) throw new Error("image fetch failed");
      const blob = await res.blob();
      // Safari/Chrome only expose async clipboard writes behind a user gesture,
      // which is why this must run directly inside the click handler.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("Image copied");
    } catch {
      flash("Image copy unsupported here");
    }
  }

  async function download() {
    try {
      const res = await fetch(ogUrl);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `loom-${username}-${format}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(ogUrl, "_blank");
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${name} â€” L.O.O.M.`, text, url });
        return;
      } catch {
        /* user dismissed, or unsupported payload: fall through to link */
      }
    }
    copyLink();
  }

  const formats = [
    { id: "feed", label: "Feed", note: "1200Ã—630 â€” link previews, Slack, X" },
    { id: "story", label: "Story", note: "1080Ã—1920 â€” Instagram, WhatsApp status" },
    { id: "square", label: "Square", note: "1080Ã—1080 â€” feed posts" }
  ];
  const current = formats.find((f) => f.id === format);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={share} className="btn-ink !py-2 text-sm">Share card</button>
        <button onClick={copyLink} className="btn-ghost !py-2 text-sm">Copy link</button>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="btn-ghost !py-2 text-sm"
        >
          {open ? "Hide card" : "Preview & download"}
        </button>
        {copied && (
          <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{copied} âœ“</span>
        )}
      </div>

      {open && (
        <div
          className="mt-4 rounded-2xl border p-4"
          style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
        >
          <div className="flex flex-wrap gap-1.5">
            {formats.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{
                  border: `1px solid ${format === f.id ? "var(--accent)" : "var(--line)"}`,
                  background: format === f.id ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
                  color: format === f.id ? "var(--accent)" : "var(--text-muted)"
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* The card itself, generated server-side by the same renderer the
              recipient's unfurl uses. */}
          <div
            className="mt-3 overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--line)", background: "#0a1628" }}
          >
            {/* Plain <img>: this is a generated raster asset, not a next/image
                optimised import. next/image would try to fetch and re-encode it. */}
            <img
              src={ogUrl}
              alt={`Shareable card for ${name}`}
              width={1200}
              height={format === "story" ? 1920 : format === "square" ? 1080 : 630}
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                maxHeight: format === "feed" ? "none" : 420,
                objectFit: format === "feed" ? "cover" : "contain",
                objectPosition: "top"
              }}
              loading="lazy"
            />
          </div>

          <p className="meta mt-2">{current.note}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={copyImage} className="btn-ink !py-2 text-sm">Copy image</button>
            <button onClick={download} className="btn-ghost !py-2 text-sm">Download PNG</button>
            <a
              href={ogUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost !py-2 text-sm"
            >
              Open raw
            </a>
          </div>

          <p className="meta mt-3">
            Every number on the card is read from the database. Empty stats are
            left off entirely rather than shown as zero.
          </p>
        </div>
      )}
    </div>
  );
}
