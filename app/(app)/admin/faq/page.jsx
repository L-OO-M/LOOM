"use client";

import { useEffect, useState } from "react";
import { Search, Eye, EyeOff, Plus, Check, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import "../_components/admin-ledger.css";

export default function AdminFaqPage() {
  const [faqs, setFaqs] = useState([]);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ slug: "", question: "", answer: "", sortOrder: 0 });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [toggling, setToggling] = useState(null);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/faq").then((r) => r.json()).then((d) => {
      if (!live) return;
      if (d.ok) setFaqs(d.data?.faqs ?? []);
      else setFailed(true);
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/faq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...f, slug: f.slug || undefined, sortOrder: Number(f.sortOrder) })
      });
      const d = await res.json();
      if (!d.ok) setMsg(d.error?.message || "Failed");
      else {
        setFaqs((prev) => [...prev, d.data.faq].sort((a, b) => (a.sort_order - b.sort_order) || (a.created_at < b.created_at ? -1 : 1)));
        setF({ slug: "", question: "", answer: "", sortOrder: 0 });
        setMsg("Saved ✓");
      }
    } catch {
      setMsg("Network error — try again");
    }
    setBusy(false);
  }

  async function togglePublish(faq) {
    setToggling(faq.id);
    try {
      const res = await fetch("/api/admin/faq", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: faq.id, isPublished: !faq.is_published })
      });
      const d = await res.json();
      if (d.ok) setFaqs((prev) => prev.map((x) => (x.id === faq.id ? d.data.faq : x)));
      else setMsg(d.error?.message || "Toggle failed");
    } catch {
      setMsg("Network error — try again");
    }
    setToggling(null);
  }

  const filtered = faqs.filter((x) => !q || x.question.toLowerCase().includes(q.toLowerCase()) || x.slug.toLowerCase().includes(q.toLowerCase()));
  const published = faqs.filter((x) => x.is_published).length;

  return (
    <AppShell area="admin">
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Public site / ${faqs.length} total / ${published} published`}
          title="FAQ"
          lede="What signed-out visitors read on /faq. Unpublished rows stay hidden — publish when the answer is honest and process-level."
          meta={`${faqs.length - published} hidden / ${filtered.length} in view`}
          tone="paper"
          stats={[
            { value: faqs.length, label: "rows on record" },
            { value: published, label: "published to /faq" },
            { value: faqs.length - published, label: "hidden" },
            { value: filtered.length, label: "rows in view" }
          ]}
        />

        <div className="aled-toolbar">
          <span className="aled-meta" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            <Eye size={12} aria-hidden="true" /> {published} published / {faqs.length - published} hidden
          </span>
          <label className="aled-search" style={{ flexBasis: "14rem", marginLeft: "auto" }}>
            <Search size={12} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search question or slug…" aria-label="Search FAQ" />
          </label>
        </div>

        {failed && (
          <div className="aled-empty" style={{ borderStyle: "solid", borderColor: "color-mix(in srgb, var(--danger) 22%, transparent)" }}>
            <p className="aled-empty-title" style={{ color: "var(--danger)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <AlertTriangle size={14} aria-hidden="true" /> Could not load FAQs
            </p>
            <p className="aled-empty-body">Check the connection and reload the page.</p>
          </div>
        )}

        <div className="aled-split">
          <section aria-label="FAQ ledger">
            <div className="aled-meta">{filtered.length} shown / {q ? "filtered" : "all"} / order follows sort_order</div>
            {filtered.length === 0 ? (
              <WorkspaceEmpty
                title={faqs.length === 0 ? "No FAQ rows yet" : "No matches"}
                body={faqs.length === 0 ? "Seed with node load/seed-faq.js or add the first one on the right." : "Try a different search term or clear the filter."}
              />
            ) : (
              <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
                {filtered.map((x) => (
                  <li key={x.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto", opacity: x.is_published ? 1 : 0.82 }}>
                    <div className="aled-copy">
                      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem" }}>
                        <span className={`aled-tag ${x.is_published ? "aled-tag--success" : ""}`}>
                          {x.is_published ? <Eye size={10} aria-hidden="true" /> : <EyeOff size={10} aria-hidden="true" />}
                          {x.is_published ? "Published" : "Hidden"}
                        </span>
                        <span className="aled-title" style={{ display: "inline" }}>{x.question}</span>
                      </span>
                      <p className="aled-sub">{x.slug} / order {x.sort_order}</p>
                      <p className="aled-sub">{x.answer.slice(0, 140)}</p>
                    </div>
                    <span className="aled-actions">
                      <button
                        onClick={() => togglePublish(x)}
                        disabled={toggling === x.id}
                        className={`aled-tag ${x.is_published ? "" : "aled-tag--accent"}`}
                        style={{ minHeight: 30, background: "transparent", cursor: "pointer", opacity: toggling === x.id ? 0.5 : 1 }}
                      >
                        {toggling === x.id ? "Saving…" : x.is_published ? <><EyeOff size={12} aria-hidden="true" /> Unpublish</> : <><Eye size={12} aria-hidden="true" /> Publish</>}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <WorkspaceSection title="Add FAQ" note="Unpublished rows are hidden on /faq — publish when the answer is ready." className="mt-0">
            <form onSubmit={create} className="aled-panel aled-form">
              <label>Slug / optional
                <input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="refunds" className="aled-field" />
              </label>
              <label>Question
                <input value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} required minLength={8} placeholder="Question" className="aled-field" />
              </label>
              <label>Answer
                <textarea value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} required minLength={8} rows={4} placeholder="Honest, process-level answer" className="aled-field" />
              </label>
              <label>Sort order
                <input value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} type="number" min={0} placeholder="0" className="aled-field" />
              </label>
              {msg && (
                <p className={`aled-tag ${msg.includes("✓") ? "aled-tag--success" : "aled-tag--danger"}`} style={{ display: "inline-flex", alignSelf: "flex-start", padding: "0.28rem 0.5rem" }}>
                  {msg.includes("✓") ? <Check size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />} {msg}
                </p>
              )}
              <button disabled={busy} className="btn-ink inline-flex items-center justify-center gap-1.5 disabled:opacity-50"><Plus size={14} aria-hidden="true" /> {busy ? "Saving…" : "Save FAQ"}</button>
            </form>
          </WorkspaceSection>
        </div>
      </main>
    </AppShell>
  );
}
