"use client";

import { useEffect, useState } from "react";
import { HelpCircle, Search, Eye, EyeOff, Plus, Check, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";

const input = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]";
const inputStyle = { borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" };

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
        <PageHeader kicker={`Public site · ${faqs.length} total · ${published} published`} title="FAQ" desc="What signed-out visitors read on /faq. Unpublished rows stay hidden — publish when the answer is honest and process-level." />

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 rounded-2xl border px-3.5 py-2" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <HelpCircle size={14} style={{ color: "var(--text-muted)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{published} published</span>
            <span className="meta">· {faqs.length - published} hidden</span>
          </div>
          <div className="relative ml-auto flex-1 max-w-xs">
            <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search question or slug…" className="w-full rounded-xl border py-2 pl-7 pr-3 text-sm outline-none" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }} />
          </div>
        </div>

        {failed && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "color-mix(in srgb, var(--danger) 22%, transparent)", background: "color-mix(in srgb, var(--danger) 8%, var(--bg))", color: "var(--danger)" }}>
            <AlertTriangle size={14} /> Could not load FAQs — check connection and reload.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section>
            <Meta>{filtered.length} shown · {q ? "filtered" : "all"} · drag order via sort_order</Meta>
            {filtered.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{faqs.length === 0 ? "No FAQ rows yet" : "No matches"}</p>
                <p className="narrative mx-auto mt-2 max-w-md">{faqs.length === 0 ? "Seed with node load/seed-faq.js or add the first one on the right." : "Try a different search term or clear the filter."}</p>
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {filtered.map((x) => (
                  <li key={x.id} className="group flex items-start justify-between gap-3 rounded-2xl border p-4 transition hover:shadow-sm" style={{ borderColor: x.is_published ? "var(--line)" : "color-mix(in srgb, var(--line) 60%, transparent)", background: x.is_published ? "var(--bg-elevated)" : "color-mix(in srgb, var(--bg-elevated) 70%, var(--bg))", opacity: x.is_published ? 1 : 0.85 }}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-flex size-6 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: x.is_published ? "color-mix(in srgb, #16a34a 12%, var(--bg))" : "var(--bg)", color: x.is_published ? "#16a34a" : "var(--text-muted)" }}>{x.is_published ? <Eye size={11} /> : <EyeOff size={11} />}</span>
                        <span className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{x.question}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs" style={{ color: "var(--text-muted)" }}>{x.slug} · order {x.sort_order} · {x.is_published ? "published" : "hidden"}</span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-5" style={{ color: "var(--text-muted)" }}>{x.answer.slice(0, 140)}</span>
                    </span>
                    <button onClick={() => togglePublish(x)} disabled={toggling === x.id} className="inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:border-[var(--accent)] disabled:opacity-50" style={{ borderColor: "var(--line)", background: x.is_published ? "var(--bg)" : "color-mix(in srgb, var(--accent) 10%, var(--bg))", color: x.is_published ? "var(--text-muted)" : "var(--accent)" }}>
                      {toggling === x.id ? "Saving…" : x.is_published ? <><EyeOff size={12} /> Unpublish</> : <><Eye size={12} /> Publish</>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <form onSubmit={create} className="grid h-fit gap-3 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><Plus size={14} /> Add FAQ</h2>
            <input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="slug (optional, e.g. refunds)" className={input} style={inputStyle} />
            <input value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} required minLength={8} placeholder="Question" className={input} style={inputStyle} />
            <textarea value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} required minLength={8} rows={4} placeholder="Honest, process-level answer" className={input} style={inputStyle} />
            <input value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} type="number" min={0} placeholder="order" className={input} style={inputStyle} />
            {msg && <p className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: msg.includes("✓") ? "color-mix(in srgb, #16a34a 18%, transparent)" : "color-mix(in srgb, var(--danger) 18%, transparent)", background: msg.includes("✓") ? "color-mix(in srgb, #16a34a 10%, var(--bg))" : "color-mix(in srgb, var(--danger) 10%, var(--bg))", color: msg.includes("✓") ? "#16a34a" : "var(--danger)" }}>{msg.includes("✓") ? <Check size={12} /> : <AlertTriangle size={12} />} {msg}</p>}
            <button disabled={busy} className="btn-ink inline-flex items-center justify-center gap-1.5 disabled:opacity-50"><Plus size={14} /> {busy ? "Saving…" : "Save FAQ"}</button>
            <p className="meta">Unpublished rows are hidden on /faq — publish when ready.</p>
          </form>
        </div>
      </main>
    </AppShell>
  );
}
