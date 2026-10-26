"use client";

import { useEffect, useId, useRef, useState } from "react";

const FORMATS = [
  { id: "feed", label: "Feed", note: "1200×630 — link previews, Slack, X", width: 1200, height: 630 },
  { id: "story", label: "Story", note: "1080×1920 — Instagram, WhatsApp status", width: 1080, height: 1920 },
  { id: "square", label: "Square", note: "1080×1080 — feed posts", width: 1080, height: 1080 }
];

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * The share studio. The card is previewed before it is shared, because a
 * recipient's first impression is the image, not the link. Formats are real
 * paths (`/card/story`), not query strings, so each one is cached separately.
 */
export function ShareSheet({ username, name, url, compact = false }) {
  const baseId = useId().replace(/:/g, "");
  const [format, setFormat] = useState("feed");
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const current = FORMATS.find((f) => f.id === format) || FORMATS[0];
  const base = String(url || "").replace(/\/$/, "");
  const cardUrl = `${base}/card/${current.id}`;
  const caption = `${name} on LOOM — proof, projects and reputation. ${base}`;

  function flash(message, isError = false) {
    setFeedback(message);
    setFailed(isError);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(""), 2800);
  }

  async function copyLink() {
    const ok = await copyText(base);
    flash(ok ? "Link copied" : "Copy failed — select the link instead", !ok);
  }

  async function copyCaption() {
    const ok = await copyText(caption);
    flash(ok ? "Caption copied" : "Copy failed — select the text instead", !ok);
  }

  async function copyImage() {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      flash("Image copy is unsupported here — download it instead", true);
      return;
    }
    try {
      const res = await fetch(cardUrl);
      if (!res.ok) throw new Error("image fetch failed");
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("Image copied");
    } catch {
      flash("Couldn't copy the image — download it instead", true);
    }
  }

  async function download() {
    try {
      const res = await fetch(cardUrl);
      if (!res.ok) throw new Error("image fetch failed");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `loom-${username}-${current.id}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      flash(`${current.label} card downloaded`);
    } catch {
      window.open(cardUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function share() {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      const res = await fetch(cardUrl);
      if (res.ok) {
        const blob = await res.blob();
        const file = new File([blob], `loom-${username}-${current.id}.png`, { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: `${name} — LOOM`, text: caption });
          return;
        }
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
    try {
      await navigator.share({ title: `${name} — LOOM`, text: caption, url: base });
    } catch (err) {
      if (err?.name !== "AbortError") await copyLink();
    }
  }

  function onTabKeyDown(event) {
    const index = FORMATS.findIndex((f) => f.id === format);
    let next = null;
    if (event.key === "ArrowRight") next = (index + 1) % FORMATS.length;
    if (event.key === "ArrowLeft") next = (index - 1 + FORMATS.length) % FORMATS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = FORMATS.length - 1;
    if (next === null) return;
    event.preventDefault();
    setFormat(FORMATS[next].id);
    document.getElementById(`${baseId}-tab-${FORMATS[next].id}`)?.focus();
  }

  return (
    <section id="share" className={`share-studio${compact ? " is-compact" : ""}`} aria-labelledby={`${baseId}-heading`}>
      <div className="share-studio-head">
        <h3 id={`${baseId}-heading`}>Share this folio</h3>
        <span className="share-studio-note">{current.note}</span>
      </div>

      <div className="share-tabs" role="tablist" aria-label="Card format">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${f.id}`}
            aria-selected={format === f.id}
            aria-controls={`${baseId}-panel`}
            tabIndex={format === f.id ? 0 : -1}
            className="share-tab"
            onClick={() => setFormat(f.id)}
            onKeyDown={onTabKeyDown}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div
        className="share-preview"
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${current.id}`}
      >
        {/* A generated raster asset, not a next/image candidate. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={current.id}
          src={cardUrl}
          alt={`${current.label} share card for ${name}`}
          width={current.width}
          height={current.height}
          loading="lazy"
          style={{ maxHeight: current.id === "feed" ? "none" : 420, objectFit: "contain", objectPosition: "top" }}
        />
      </div>

      <div className="share-actions">
        <button type="button" onClick={share} className="btn-ink">Share</button>
        <button type="button" onClick={copyLink} className="btn-ghost">Copy link</button>
        <button type="button" onClick={copyCaption} className="btn-ghost">Copy caption</button>
        <button type="button" onClick={copyImage} className="btn-ghost">Copy image</button>
        <button type="button" onClick={download} className="btn-ghost">Download PNG</button>
        <a href={cardUrl} target="_blank" rel="noreferrer" className="btn-ghost">Open raw</a>
      </div>

      <p className={`share-feedback${failed ? " is-error" : ""}`} role="status" aria-live="polite">
        {feedback}
      </p>

      <p className="folio-note">
        Every number on the card is read from the database. Empty stats are left
        off rather than shown as zero.
      </p>
    </section>
  );
}
