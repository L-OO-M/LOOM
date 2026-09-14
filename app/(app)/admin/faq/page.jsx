"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";

const input = { width: "100%", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14 };

// Tiny FAQ manager: create entries, toggle published, edit copy. Real DB
// rows only — the list is the source of truth for the public /faq page.
export default function AdminFaqPage() {
  const [faqs, setFaqs] = useState([]);
  const [failed, setFailed] = useState(false);
  const [f, setF] = useState({ slug: "", question: "", answer: "", sortOrder: 0 });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

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
      if (!d.ok) {
        setMsg(d.error?.message || "Failed");
      } else {
        setFaqs((prev) => [...prev, d.data.faq].sort((a, b) => (a.sort_order - b.sort_order) || (a.created_at < b.created_at ? -1 : 1)));
        setF({ slug: "", question: "", answer: "", sortOrder: 0 });
      }
    } catch {
      setMsg("Network error — try again");
    }
    setBusy(false);
  }

  async function togglePublish(faq) {
    try {
      const res = await fetch("/api/admin/faq", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: faq.id, isPublished: !faq.is_published })
      });
      const d = await res.json();
      if (d.ok) setFaqs((prev) => prev.map((x) => (x.id === faq.id ? d.data.faq : x)));
    } catch { /* honest fallback: row stays as-is */ }
  }

  return (
    <AppShell area="admin">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Public site" title="FAQ" desc="What signed-out visitors read on /faq. Unpublished rows stay hidden." />
        {failed && (
          <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>
            Could not load FAQs. Check your connection and reload — nothing here is cached.
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-2">
            {faqs.map((q) => (
              <div key={q.id} className="flex items-start justify-between gap-3 rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", opacity: q.is_published ? 1 : 0.65 }}>
                <span className="min-w-0">
                  <span className="block text-sm font-medium" style={{ color: "var(--text)" }}>{q.question}</span>
                  <span className="mt-1 block truncate text-xs" style={{ color: "var(--text-muted)" }}>{q.slug} · order {q.sort_order} · {q.is_published ? "published" : "hidden"}</span>
                </span>
                <button onClick={() => togglePublish(q)} className="btn-ghost shrink-0 !py-1.5 text-xs">
                  {q.is_published ? "Unpublish" : "Publish"}
                </button>
              </div>
            ))}
            {faqs.length === 0 && !failed && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No FAQ rows yet — seed with <code>node load/seed-faq.js</code> or add the first one here.
              </p>
            )}
          </div>
          <form onSubmit={create} className="grid h-fit gap-3 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Add FAQ</p>
            <input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="slug (optional, e.g. refunds)" style={input} />
            <input value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} required minLength={8} placeholder="Question" style={input} />
            <textarea value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} required minLength={8} rows={4} placeholder="Honest, process-level answer" style={input} />
            <input value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} type="number" min={0} placeholder="order" style={input} />
            {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
            <button disabled={busy} className="btn-ink w-fit disabled:opacity-50">{busy ? "Saving…" : "Save FAQ"}</button>
          </form>
        </div>
      </main>
    </AppShell>
  );
}
