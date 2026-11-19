"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SOURCE_REASON = {
  project: "No GitHub push grant matches this repository.",
  student_claim: "Student-claimed; no merged pull request signal yet."
};

function reason(item) {
  return SOURCE_REASON[item.source] || "No authoritative source backs this claim yet.";
}

function signalKey(item) {
  return item.signal || `${item.kind}:${item.id}`;
}

export function ProofReviewQueue({ items = [] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(() => new Set());
  const [busy, setBusy] = useState(() => new Set());
  const [notes, setNotes] = useState({});
  const [errors, setErrors] = useState({});
  const [flash, setFlash] = useState("");

  const visible = useMemo(() => items.filter((item) => !hidden.has(signalKey(item))), [items, hidden]);

  const groups = useMemo(() => {
    const byStudent = new Map();
    for (const item of visible) {
      const key = item.userId;
      if (!byStudent.has(key)) {
        byStudent.set(key, { userId: key, name: item.studentName || key, items: [] });
      }
      byStudent.get(key).items.push(item);
    }
    return Array.from(byStudent.values());
  }, [visible]);

  async function decide(item, decision) {
    const key = signalKey(item);
    if (busy.has(key)) return;
    setBusy((prev) => new Set(prev).add(key));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFlash("");

    let payload;
    try {
      const res = await fetch("/api/admin/proof", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: item.userId,
          signal: item.signal,
          decision,
          note: notes[key] || undefined
        })
      });
      payload = await res.json();
    } catch {
      payload = { ok: false, error: { message: "Could not reach the server. Try again." } };
    }

    setBusy((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

    if (!payload?.ok) {
      setErrors((prev) => ({
        ...prev,
        [key]: payload?.error?.message || "Could not record that decision."
      }));
      return;
    }

    setHidden((prev) => new Set(prev).add(key));
    setFlash(
      decision === "approve"
        ? "Approved. The item is now verified proof for this student."
        : "Rejected. The evidence was kept and the item left the queue."
    );
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <div className="aled-empty">
        <p className="aled-empty-title">Nothing waiting for review</p>
        <p className="aled-empty-body">
          Every claimed item is either backed by an authoritative source or already has a
          human decision on record. New claims appear here automatically.
        </p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="aled-empty">
        <p className="aled-empty-title">Queue cleared</p>
        <p className="aled-empty-body">
          You have decided every item in this batch. Refresh the page to see anything new.
        </p>
      </div>
    );
  }

  return (
    <div className="aled-stack" style={{ marginTop: "1.1rem" }}>
      {flash && (
        <p className="aled-meta" role="status" style={{ color: "var(--success)" }}>
          {flash}
        </p>
      )}

      {groups.map((group) => (
        <div key={group.userId} className="aled-panel">
          <p className="aled-panel-title">
            {group.name}
            <span className="aled-tag aled-tag--warn" style={{ marginLeft: "0.45rem" }}>
              {group.items.length} pending
            </span>
          </p>
          <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0 }}>
            {group.items.map((item) => {
              const key = signalKey(item);
              const isBusy = busy.has(key);
              return (
                <li
                  key={key}
                  className="aled-row"
                  style={{ "--aled-cols": "minmax(0, 1fr) auto" }}
                >
                  <div className="aled-copy">
                    <span className="aled-title">
                      {item.label}
                      <span className="aled-tag" style={{ marginLeft: "0.4rem" }}>
                        {item.source}
                      </span>
                    </span>
                    <p className="aled-sub">
                      {item.href ? (
                        item.href.startsWith("/") ? (
                          <Link href={item.href} prefetch={false}>
                            {item.detail}
                          </Link>
                        ) : (
                          <a href={item.href} target="_blank" rel="noreferrer">
                            {item.detail}
                          </a>
                        )
                      ) : (
                        item.detail
                      )}
                    </p>
                    <p className="aled-sub">{reason(item)}</p>
                    <label
                      htmlFor={`proof-note-${key}`}
                      className="aled-meta"
                      style={{ display: "block", marginTop: "0.45rem" }}
                    >
                      Note (optional)
                    </label>
                    <input
                      id={`proof-note-${key}`}
                      className="aled-field"
                      style={{ marginTop: "0.25rem" }}
                      value={notes[key] || ""}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      maxLength={500}
                      placeholder="What would make this verifiable?"
                      disabled={isBusy}
                    />
                    {errors[key] && (
                      <p role="alert" className="text-xs" style={{ color: "var(--danger)", marginTop: "0.35rem" }}>
                        {errors[key]}
                      </p>
                    )}
                  </div>
                  <div className="aled-actions">
                    <button
                      type="button"
                      className="btn-ink !py-1.5 text-xs disabled:opacity-50"
                      onClick={() => decide(item, "approve")}
                      disabled={isBusy}
                      aria-busy={isBusy ? "true" : undefined}
                    >
                      {isBusy ? "Saving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !py-1.5 text-xs disabled:opacity-50"
                      onClick={() => decide(item, "reject")}
                      disabled={isBusy}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
