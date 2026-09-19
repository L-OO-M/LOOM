"use client";

import { useState } from "react";
import { Building2, Users, Pencil, Clock3, Check, ChevronDown } from "lucide-react";

export function DepartmentCard({ dept, action }) {
  const [open, setOpen] = useState(false);
  const input = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]";
  const inputStyle = { borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" };

  return (
    <li
      className="group relative overflow-hidden rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-sm"
      style={{ borderColor: dept.is_active ? "var(--line)" : "color-mix(in srgb, var(--line) 70%, transparent)", background: dept.is_active ? "var(--bg-elevated)" : "color-mix(in srgb, var(--bg-elevated) 70%, var(--bg))", opacity: dept.is_active ? 1 : 0.92 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>
              <Building2 size={13} />
            </span>
            <h3 className="font-display truncate text-[1.02rem] font-medium leading-tight" style={{ color: "var(--text)" }}>{dept.name}</h3>
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>{dept.vertical}</span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: dept.is_active ? "color-mix(in srgb, #16a34a 12%, transparent)" : "var(--bg)", color: dept.is_active ? "#16a34a" : "var(--text-muted)", border: `1px solid ${dept.is_active ? "color-mix(in srgb, #16a34a 18%, transparent)" : "var(--line)"}` }}>
              <span className="size-1.5 rounded-full" style={{ background: dept.is_active ? "#16a34a" : "var(--line)" }} /> {dept.is_active ? "Active" : "Archived"}
            </span>
          </div>
          <p className="meta mt-1 font-mono text-xs">/{dept.slug}</p>
          {dept.description ? <p className="narrative mt-2 line-clamp-2 text-sm leading-5">{dept.description}</p> : <p className="meta mt-2 italic">No description — add one so students know what this department owns.</p>}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}
        >
          <Pencil size={12} /> {open ? "Close" : "Edit"} <ChevronDown size={12} className={`transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>
          <Users size={12} style={{ color: "var(--text-muted)" }} /> {dept.members} member{dept.members === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>
          {dept.head_name ? `Head: ${dept.head_name}` : "No head"} {dept.co_head_name ? `· Co: ${dept.co_head_name}` : ""}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>
          <Clock3 size={12} /> {dept.last_activity ? new Date(dept.last_activity).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "no activity yet"}
        </span>
      </div>

      {open && (
        <form action={action} className="mt-5 grid gap-3 rounded-xl border p-4 animate-in" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
          <input type="hidden" name="id" value={dept.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium" style={{ color: "var(--text)" }}>Name
              <input name="name" defaultValue={dept.name} required minLength={2} maxLength={120} className={input} style={inputStyle} />
            </label>
            <label className="text-xs font-medium" style={{ color: "var(--text)" }}>Vertical
              <select name="vertical" defaultValue={dept.vertical} className={input} style={inputStyle}>
                <option value="technical">Technical</option>
                <option value="non_technical">Non-technical</option>
              </select>
            </label>
          </div>
          <label className="text-xs font-medium" style={{ color: "var(--text)" }}>Slug <span className="font-normal" style={{ color: "var(--text-muted)" }}>· auto from name if left blank on create; immutable intent here</span>
            <input name="slug" defaultValue={dept.slug} readOnly className={`${input} opacity-60`} style={inputStyle} title="Slug is immutable after creation — shown for reference" />
          </label>
          <label className="text-xs font-medium" style={{ color: "var(--text)" }}>Description
            <input name="description" defaultValue={dept.description || ""} maxLength={1000} placeholder="What this department owns" className={input} style={inputStyle} />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text)" }}>
            <input type="checkbox" name="isActive" defaultChecked={dept.is_active} className="rounded" /> Active — visible to students and joinable
          </label>
          <div className="flex items-center gap-2">
            <button className="btn-ink inline-flex items-center gap-1.5"><Check size={14} /> Save changes</button>
            <span className="meta">Heads are assigned from the roster — role grant creates the membership.</span>
          </div>
        </form>
      )}
    </li>
  );
}
