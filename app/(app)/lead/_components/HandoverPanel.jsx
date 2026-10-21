"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ClipboardCheck, Loader2 } from "lucide-react";
import { Field, inputStyle } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";

const EMPTY_FORM = {
  toUserId: "",
  summary: "",
  responsibilities: "",
  activeWork: "",
  risks: "",
  contacts: "",
  transferPlanner: true,
  transferEventOps: true,
  transferHeadSlot: true
};

const STATUS = {
  draft: { label: "Draft", color: "var(--text-muted)" },
  submitted: { label: "Waiting for admin", color: "var(--warn)" },
  completed: { label: "Completed", color: "var(--success)" },
  rejected: { label: "Sent back", color: "var(--danger)" },
  cancelled: { label: "Cancelled", color: "var(--text-muted)" }
};

function formFrom(handover) {
  return {
    toUserId: handover.to_user_id || "",
    summary: handover.brief?.summary || "",
    responsibilities: handover.brief?.responsibilities || "",
    activeWork: handover.brief?.activeWork || "",
    risks: handover.brief?.risks || "",
    contacts: handover.brief?.contacts || "",
    transferPlanner: handover.transfer_planner !== false,
    transferEventOps: handover.transfer_event_ops !== false,
    transferHeadSlot: handover.transfer_head_slot !== false
  };
}

export function HandoverPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/lead/handover", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.error?.message || "Could not load handover.");
        return;
      }
      setError("");
      setData(json.data);
      const active = (json.data.handovers || []).find((h) => ["draft", "submitted", "rejected"].includes(h.status));
      setForm(active ? formFrom(active) : EMPTY_FORM);
    } catch {
      setError("Network error — try again.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = (data?.handovers || []).find((h) => ["draft", "submitted", "rejected"].includes(h.status)) || null;
  const history = (data?.handovers || []).filter((h) => h.status === "completed" || h.status === "cancelled");

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(action) {
    setBusy(action);
    setNotice("");
    const payload = {
      action,
      toUserId: form.toUserId,
      brief: {
        summary: form.summary,
        responsibilities: form.responsibilities,
        activeWork: form.activeWork,
        risks: form.risks,
        contacts: form.contacts
      },
      transferPlanner: form.transferPlanner,
      transferEventOps: form.transferEventOps,
      transferHeadSlot: form.transferHeadSlot
    };
    const url = active ? `/api/lead/handover/${active.id}` : "/api/lead/handover";
    const method = active ? "PATCH" : "POST";
    const requestBody = active ? payload : { ...payload, action: undefined, submit: action === "submit" };
    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setNotice(json?.error?.message || "Could not save the handover.");
      } else {
        setNotice(action === "submit" ? "Submitted. An admin will review it." : "Draft saved.");
        await load();
      }
    } catch {
      setNotice("Network error — try again.");
    }
    setBusy("");
  }

  async function cancel() {
    if (!active) return;
    setBusy("cancel");
    setNotice("");
    try {
      const res = await fetch(`/api/lead/handover/${active.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" })
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) setNotice(json?.error?.message || "Could not cancel.");
      else {
        setNotice("Handover cancelled.");
        await load();
      }
    } catch {
      setNotice("Network error — try again.");
    }
    setBusy("");
  }

  if (!data && !error) {
    return <div className="h-32 animate-pulse rounded-2xl border" style={{ borderColor: "var(--line)" }} />;
  }

  if (error && !data) {
    return (
      <section className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        <Meta>Handover</Meta>
        <p className="narrative mt-2">{error}</p>
        <button onClick={load} className="btn-ghost mt-3 !py-1.5 !text-xs">Retry</button>
      </section>
    );
  }

  if (!data.canDraft) {
    return (
      <section className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        <Meta>Handover</Meta>
        <p className="narrative mt-2">{data.reason || "Handover is available to live department heads, vertical leads and admins."}</p>
      </section>
    );
  }

  const submitted = active?.status === "submitted";
  const status = active ? STATUS[active.status] : null;
  const roleLabel = data.role === "dept_lead" ? "Department Head" : data.role === "vertical_lead" ? "Vertical Lead" : "Super Admin";

  return (
    <section className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Leadership handover">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--accent)" }}>
          <ClipboardCheck size={14} />
        </span>
        <div>
          <Meta>Handover</Meta>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            {roleLabel}{data.departmentName ? ` · ${data.departmentName}` : data.vertical ? ` · ${data.vertical === "technical" ? "Technical" : "Non-technical"}` : ""}
          </p>
        </div>
        {status && (
          <span className="ml-auto rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-widest" style={{ borderColor: status.color, color: status.color }}>
            {status.label.toUpperCase()}
          </span>
        )}
      </div>

      <p className="narrative mt-2">
        Nominate a successor and leave the next person a real brief. On approval the seat, planner sessions and open event-ops move together.
      </p>

      {active && submitted ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
            <p className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
              <strong>{active.from_name || "You"}</strong>
              <ArrowRight size={13} aria-hidden="true" />
              <strong>{active.to_name || "successor"}</strong>
            </p>
            <div className="mt-3 space-y-2 text-sm" style={{ color: "var(--text-muted)" }}>
              <p><strong style={{ color: "var(--text)" }}>Owns:</strong> {active.brief?.summary}</p>
              <p><strong style={{ color: "var(--text)" }}>In flight:</strong> {active.brief?.responsibilities}</p>
              {active.brief?.activeWork && <p><strong style={{ color: "var(--text)" }}>Active work:</strong> {active.brief.activeWork}</p>}
              {active.brief?.risks && <p><strong style={{ color: "var(--text)" }}>Risks:</strong> {active.brief.risks}</p>}
              {active.brief?.contacts && <p><strong style={{ color: "var(--text)" }}>Contacts:</strong> {active.brief.contacts}</p>}
            </div>
          </div>
          <p className="meta">An admin must approve the transfer. You can cancel while it waits.</p>
          <button onClick={cancel} disabled={busy === "cancel"} className="btn-ghost !py-2 !text-xs disabled:opacity-50">
            {busy === "cancel" ? "Cancelling…" : "Cancel handover"}
          </button>
        </div>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); save("submit"); }}>
          <Field label="Successor" hint={data.departmentName ? `Core members and leads in ${data.departmentName}.` : "Core members and leads in your scope."}>
            <select value={form.toUserId} onChange={(e) => update("toUserId", e.target.value)} required style={inputStyle}>
              <option value="">Choose a successor</option>
              {(data.candidates || []).map((c) => (
                <option key={c.user_id} value={c.user_id}>{c.name || c.user_id} · {String(c.role || "").replace("_", " ")}</option>
              ))}
            </select>
          </Field>
          <Field label="What this role owns" hint="At least 20 characters. The scope, not the job title.">
            <textarea value={form.summary} onChange={(e) => update("summary", e.target.value)} rows={2} maxLength={2000} style={inputStyle} placeholder="Owns the department calendar, Core approvals and the weekly workshop." />
          </Field>
          <Field label="What is in flight" hint="At least 20 characters. Live commitments the next person must pick up.">
            <textarea value={form.responsibilities} onChange={(e) => update("responsibilities", e.target.value)} rows={3} maxLength={4000} style={inputStyle} placeholder="Two workshops scheduled, one sponsor call open, Core review due Friday." />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Active projects">
              <textarea value={form.activeWork} onChange={(e) => update("activeWork", e.target.value)} rows={2} maxLength={4000} style={inputStyle} />
            </Field>
            <Field label="Risks">
              <textarea value={form.risks} onChange={(e) => update("risks", e.target.value)} rows={2} maxLength={4000} style={inputStyle} />
            </Field>
          </div>
          <Field label="People and partners">
            <textarea value={form.contacts} onChange={(e) => update("contacts", e.target.value)} rows={2} maxLength={2000} style={inputStyle} placeholder="Faculty advisor, venue contact, sponsor owner." />
          </Field>
          <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
            <legend className="sr-only">What moves with the seat</legend>
            <label className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <input type="checkbox" checked={form.transferPlanner} onChange={(e) => update("transferPlanner", e.target.checked)} />
              Planner sessions
            </label>
            <label className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <input type="checkbox" checked={form.transferEventOps} onChange={(e) => update("transferEventOps", e.target.checked)} />
              Event-ops tasks
            </label>
            {data.role === "dept_lead" && (
              <label className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                <input type="checkbox" checked={form.transferHeadSlot} onChange={(e) => update("transferHeadSlot", e.target.checked)} />
                Head / Co-Head slot
              </label>
            )}
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => save("save")} disabled={!!busy || !form.toUserId} className="btn-ghost !py-2 !text-xs disabled:opacity-50">
              {busy === "save" ? "Saving…" : "Save draft"}
            </button>
            <button type="submit" disabled={!!busy || !form.toUserId} className="btn-ink !py-2 !text-xs disabled:opacity-50">
              {busy === "submit" ? <><Loader2 className="inline animate-spin" size={12} /> Submitting…</> : "Submit for approval"}
            </button>
            {active && (
              <button type="button" onClick={cancel} disabled={!!busy} className="ml-auto text-xs underline-offset-2 hover:underline disabled:opacity-50" style={{ color: "var(--text-muted)" }}>
                Cancel
              </button>
            )}
          </div>
          {!data.candidates?.length && (
            <p className="meta">No eligible successors in your scope yet. Mark a Core member succession-ready first.</p>
          )}
          {notice && <p className="text-xs" style={{ color: notice.toLowerCase().includes("submitted") || notice.toLowerCase().includes("saved") ? "var(--success)" : "var(--danger)" }}>{notice}</p>}
        </form>
      )}

      {history.length > 0 && (
        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <Meta>Earlier handovers</Meta>
          <ul className="mt-2 space-y-2">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                <span>{h.to_name || "Successor"} · {h.completed_at ? new Date(h.completed_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) : "cancelled"}</span>
                <span style={{ color: STATUS[h.status]?.color }}>{STATUS[h.status]?.label || h.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
