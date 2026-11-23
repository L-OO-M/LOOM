"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowDown, ArrowUp, Plus, Save, Trash2, ExternalLink } from "lucide-react";
import { Field, inputStyle } from "@/components/ui";
import { EVENT_SECTION_TYPES, sanitizeEventPage } from "@/lib/event-page";

/**
 * Dynamic section builder for an event's public page.
 *
 * A hackathon brief is not a workshop description, so the author adds typed
 * blocks — overview, problem statements, prizes, schedule, rules, FAQ,
 * resources — reorders them, and saves once. The server re-validates every
 * block through the same pure module, so a crafted request cannot store a
 * `javascript:` link or an unknown block.
 */
export function EventPageBuilder({ event }) {
  const router = useRouter();
  const [tagline, setTagline] = useState(event?.tagline || "");
  const [coverImageUrl, setCoverImageUrl] = useState(event?.cover_image_url || "");
  const [sections, setSections] = useState(() =>
    sanitizeEventPage({ sections: event?.page_sections }).sections
  );
  const [newType, setNewType] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function addSection() {
    const meta = EVENT_SECTION_TYPES.find((entry) => entry.type === newType);
    setSections((current) => [
      ...current,
      {
        id: `s${Date.now().toString(36)}${current.length}`,
        type: newType,
        heading: meta?.label || "Section",
        body: "",
        bullets: [],
        links: []
      }
    ]);
    setMessage("");
  }

  function update(index, patch) {
    setSections((current) => current.map((section, i) => (i === index ? { ...section, ...patch } : section)));
  }

  function move(index, direction) {
    setSections((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(index) {
    setSections((current) => current.filter((_, i) => i !== index));
  }

  function updateLink(index, linkIndex, patch) {
    update(index, {
      links: sections[index].links.map((link, i) => (i === linkIndex ? { ...link, ...patch } : link))
    });
  }

  async function save() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tagline: tagline || null,
          coverImageUrl: coverImageUrl || null,
          sections
        })
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Could not save the page.");
        return;
      }
      setMessage("Page saved. The public event page shows it now.");
      router.refresh();
    } catch {
      setError("Network error - nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  const preview = coverImageUrl && (coverImageUrl.startsWith("https://") || coverImageUrl.startsWith("/"));

  return (
    <div className="mt-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Public page</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Hero, cover image and the long-form blocks students read before registering.
          </p>
        </div>
        <a href={`/events/${event.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent)" }}>
          Preview <ExternalLink size={12} />
        </a>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Tagline (shown under the title)">
          <input value={tagline} maxLength={160} onChange={(e) => setTagline(e.target.value)} placeholder="36 hours. One dataset. Real problems." style={inputStyle} />
        </Field>
        <Field label="Cover image (https URL or /path)">
          <input value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} placeholder="https://... or /events/my-cover.jpg" style={inputStyle} />
        </Field>
      </div>
      {preview ? (
        <div className="relative mt-3 h-32 w-full overflow-hidden rounded-xl" style={{ border: "1px solid var(--line)" }}>
          <Image src={coverImageUrl} alt="Cover preview" fill unoptimized sizes="600px" className="object-cover" />
        </div>
      ) : (
        <p className="meta mt-2">Leave blank to keep the generated banner artwork.</p>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Field label="Add a section">
            <select value={newType} onChange={(e) => setNewType(e.target.value)} style={inputStyle}>
              {EVENT_SECTION_TYPES.map((entry) => (
                <option key={entry.type} value={entry.type}>{entry.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <button type="button" className="btn-ghost inline-flex items-center gap-1.5" onClick={addSection}>
          <Plus size={14} /> Add block
        </button>
        <button type="button" className="btn-ink inline-flex items-center gap-1.5" onClick={save} disabled={busy}>
          <Save size={14} /> {busy ? "Saving…" : "Save page"}
        </button>
      </div>
      <p className="meta mt-2">{EVENT_SECTION_TYPES.find((entry) => entry.type === newType)?.hint}</p>

      {message ? <p role="status" className="mt-3 text-xs" style={{ color: "var(--accent)" }}>{message}</p> : null}
      {error ? <p role="alert" className="mt-3 text-xs" style={{ color: "var(--danger)" }}>{error}</p> : null}

      {sections.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed p-6 text-center" style={{ borderColor: "var(--line)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>No blocks yet.</p>
          <p className="narrative mt-1 text-xs">The page still works: title, facts, description and registration. Add a block when the event has more to say.</p>
        </div>
      ) : (
        <ol className="mt-5 grid gap-3">
          {sections.map((section, index) => (
            <li key={section.id} className="rounded-xl border p-3.5" style={{ borderColor: "var(--line)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>
                  {EVENT_SECTION_TYPES.find((entry) => entry.type === section.type)?.label || section.type}
                </p>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Move block up" className="rounded p-1" style={{ color: "var(--text-muted)" }} onClick={() => move(index, -1)} disabled={index === 0}>
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" aria-label="Move block down" className="rounded p-1" style={{ color: "var(--text-muted)" }} onClick={() => move(index, 1)} disabled={index === sections.length - 1}>
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" aria-label="Remove block" className="rounded p-1" style={{ color: "var(--danger)" }} onClick={() => remove(index)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-3">
                <Field label="Heading">
                  <input value={section.heading} maxLength={120} onChange={(e) => update(index, { heading: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Body (line breaks are kept)">
                  <textarea value={section.body} rows={4} maxLength={5000} onChange={(e) => update(index, { body: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Bullets (one per line)">
                  <textarea
                    value={section.bullets.join("\n")}
                    rows={4}
                    onChange={(e) => update(index, { bullets: e.target.value.split("\n") })}
                    placeholder="Problem A: build the ranking model&#10;Problem B: cut inference latency"
                    style={inputStyle}
                  />
                </Field>
                <div>
                  <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Links</p>
                  {section.links.map((link, linkIndex) => (
                    <div key={linkIndex} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.6fr_auto]">
                      <input value={link.label} maxLength={80} placeholder="Label" onChange={(e) => updateLink(index, linkIndex, { label: e.target.value })} style={inputStyle} />
                      <input value={link.url} placeholder="https://..." onChange={(e) => updateLink(index, linkIndex, { url: e.target.value })} style={inputStyle} />
                      <button type="button" className="rounded-lg border px-2 text-xs" style={{ borderColor: "var(--line)", color: "var(--danger)" }} onClick={() => update(index, { links: section.links.filter((_, i) => i !== linkIndex) })}>
                        Remove
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn-ghost mt-2 !py-1.5 text-xs" onClick={() => update(index, { links: [...section.links, { label: "", url: "" }] })}>
                    Add link
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
