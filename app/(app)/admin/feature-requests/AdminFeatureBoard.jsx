"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJSON } from "@/components/loom/useAction";

const STATUSES = ["pending", "needs_info", "approved", "rejected", "in_progress", "built"];

export default function AdminFeatureBoard({ initial, githubConfigured = false }) {
  const [items, setItems] = useState(initial);
  const [note, setNote] = useState({});
  const [pending, setPending] = useState({});
  const [errors, setErrors] = useState({});
  const router = useRouter();

  // Every control reports failure now. Previously a failed status change was a
  // silent no-op, and the counter-question used a blocking browser alert().
  async function act(id, patch) {
    setPending((p) => ({ ...p, [id]: true }));
    setErrors((e) => ({ ...e, [id]: "" }));
    const data = await postJSON(`/api/feature-requests/${id}`, "PATCH", patch);
    setPending((p) => ({ ...p, [id]: false }));
    if (data?.ok) {
      setItems((prev) => prev.map((r) => (r.id === id ? data.data.request : r)));
      router.refresh();
    } else {
      setErrors((e) => ({ ...e, [id]: data?.error?.message || "Nothing was saved — try again" }));
    }
  }

  async function comment(id) {
    const body = note[id]?.trim();
    if (!body) return;
    setPending((p) => ({ ...p, [id]: true }));
    setErrors((e) => ({ ...e, [id]: "" }));
    const data = await postJSON(`/api/feature-requests/${id}/comments`, "POST", { body });
    setPending((p) => ({ ...p, [id]: false }));
    if (data?.ok) {
      setNote({ ...note, [id]: "" });
      setErrors((e) => ({ ...e, [id]: "" }));
      router.refresh();
    } else {
      setErrors((e) => ({ ...e, [id]: data?.error?.message || "Question not posted" }));
    }
  }

  async function syncGitHub(id) {
    setPending((p) => ({ ...p, [id]: true }));
    setErrors((e) => ({ ...e, [id]: "" }));
    const data = await postJSON(`/api/feature-requests/${id}/github`, "POST", {});
    setPending((p) => ({ ...p, [id]: false }));
    if (data?.ok) {
      setItems((prev) => prev.map((r) => (r.id === id ? data.data.request : r)));
      router.refresh();
    } else {
      setErrors((e) => ({ ...e, [id]: data?.error?.message || "GitHub sync failed" }));
    }
  }

  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <li key={r.id} className="rounded-2xl border p-5" style={{ borderColor: errors[r.id] ? "color-mix(in srgb, var(--danger) 40%, var(--line))" : "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{r.title} <span className="meta ml-2">{r.category}</span></p>
              <p className="meta">by {r.requester_name || r.requester_id.slice(0, 8)} · {new Date(r.created_at).toLocaleDateString()}</p>
            </div>
            <span className="rounded-full border px-2 py-1 text-xs capitalize" style={{ borderColor: "var(--line)", color: "var(--text)" }}>{r.status}</span>
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{r.description}</p>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--accent)" }}>Integration / trade-offs / implementation</summary>
            <div className="mt-2 space-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {r.integration && <p><strong style={{ color: "var(--text)" }}>Integration:</strong> {r.integration}</p>}
              {r.tradeoffs && <p><strong style={{ color: "var(--text)" }}>Trade-offs:</strong> {r.tradeoffs}</p>}
              {r.implementation && <p><strong style={{ color: "var(--text)" }}>Implementation:</strong> {r.implementation}</p>}
            </div>
          </details>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {r.github_issue_url ? (
              <>
                <a href={r.github_issue_url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                  GitHub #{r.github_issue_number} ↗
                </a>
                <span className="rounded-full border px-2 py-0.5 capitalize" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>{r.github_issue_state || "open"}</span>
                {githubConfigured && (
                  <button type="button" disabled={!!pending[r.id]} onClick={() => syncGitHub(r.id)} className="rounded-full border px-2.5 py-0.5 font-semibold disabled:opacity-50" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
                    Refresh
                  </button>
                )}
              </>
            ) : githubConfigured ? (
              <button type="button" disabled={!!pending[r.id]} onClick={() => syncGitHub(r.id)} className="rounded-full border px-2.5 py-0.5 font-semibold disabled:opacity-50" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
                Create GitHub issue
              </button>
            ) : (
              <span className="meta normal-case tracking-normal">GitHub Issues not configured</span>
            )}
            {r.github_issue_error && <span style={{ color: "var(--danger)" }}>{r.github_issue_error}</span>}
          </div>
          {errors[r.id] && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{errors[r.id]}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button key={s} disabled={!!pending[r.id]} onClick={() => act(r.id, { status: s })} className="rounded-full border px-3 py-1 text-xs font-semibold capitalize disabled:opacity-50" style={{ borderColor: r.status === s ? "var(--accent)" : "var(--line)", background: r.status === s ? "var(--accent)" : "transparent", color: r.status === s ? "var(--bg)" : "var(--text-muted)" }}>{s.replace("_", " ")}</button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={note[r.id] || ""} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} placeholder="Counter-question or decision note" className="flex-1 min-w-[200px] rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg)" }} />
            <button disabled={!!pending[r.id]} onClick={() => comment(r.id)} className="rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ borderColor: "var(--line)" }}>Ask</button>
            <button disabled={!!pending[r.id]} onClick={() => act(r.id, { assigned_to: r.requester_id, status: "in_progress", decision_note: note[r.id] || "Assigned to you — start building" })} className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ color: "var(--bg)" }}>Let them build →</button>
          </div>
        </li>
      ))}
      {items.length === 0 && <p className="narrative">No ideas yet.</p>}
    </ul>
  );
}
