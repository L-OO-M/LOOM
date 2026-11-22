"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Users, Pencil, Clock3, Check, ChevronDown, ArrowUpRight, UserCog } from "lucide-react";

// A wider role already outranks dept_lead, so appointing that person must not
// rewrite their global role. They can still hold a department seat.
const WIDER_ROLES = new Set(["vertical_lead", "admin", "platform_admin"]);

function HeadSlot({ slot, label, dept, members, appointAction, vacateAction }) {
  const seat = slot === "head" ? dept.head_user_id : dept.co_head_user_id;
  const seatName = slot === "head" ? dept.head_name : dept.co_head_name;
  const options = members.filter((m) => m.user_id === seat || !WIDER_ROLES.has(m.role));
  // Legacy rows can carry a head without a matching membership row; keep the
  // current seat selectable instead of silently dropping it from the list.
  if (seat && !options.some((m) => m.user_id === seat)) {
    options.unshift({ user_id: seat, name: seatName, level: "dept-lead", role: "dept_lead" });
  }
  const input = "w-full min-w-0 rounded-lg border px-2.5 py-2 text-xs outline-none focus:border-[var(--accent)]";
  const inputStyle = { borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" };

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
      <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>{label}</p>
      <p className="meta mt-0.5">{seatName ? `Currently ${seatName}` : "Seat vacant"}</p>
      <form action={appointAction} className="mt-2 flex items-center gap-1.5">
        <input type="hidden" name="departmentId" value={dept.id} />
        <input type="hidden" name="slot" value={slot} />
        <select
          key={seat || "vacant"}
          name="userId"
          required
          defaultValue={seat || ""}
          aria-label={`Choose ${label}`}
          className={input}
          style={inputStyle}
        >
          <option value="" disabled>{options.length ? `Choose ${label.toLowerCase()}…` : "No eligible members yet"}</option>
          {options.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.name || "Unnamed member"} · {String(m.level).replace("_", "-")}
            </option>
          ))}
        </select>
        <button disabled={options.length === 0} className="btn-ink shrink-0 !px-2.5 !py-2 text-xs disabled:opacity-50">
          {seat ? "Replace" : "Appoint"}
        </button>
      </form>
      {seat && (
        <form action={vacateAction} className="mt-1.5">
          <input type="hidden" name="departmentId" value={dept.id} />
          <input type="hidden" name="slot" value={slot} />
          <button className="meta underline-offset-2 hover:underline" style={{ color: "var(--text-muted)" }}>
            Vacate seat
          </button>
        </form>
      )}
    </div>
  );
}

export function DepartmentCard({ dept, members = [], action, appointAction, vacateAction }) {
  const [open, setOpen] = useState(false);
  const input = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]";
  const inputStyle = { borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" };

  return (
    <li className="group" style={{ opacity: dept.is_active ? 1 : 0.92 }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>
              <Building2 size={13} />
            </span>
            <h3 className="font-display truncate text-[1.02rem] font-medium leading-tight" style={{ color: "var(--text)" }}>{dept.name}</h3>
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>
              {dept.vertical === "non_technical" ? "non-technical" : dept.vertical}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: dept.is_active ? "color-mix(in srgb, #16a34a 12%, transparent)" : "var(--bg)", color: dept.is_active ? "#16a34a" : "var(--text-muted)", border: `1px solid ${dept.is_active ? "color-mix(in srgb, #16a34a 18%, transparent)" : "var(--line)"}` }}>
              <span className="size-1.5 rounded-full" style={{ background: dept.is_active ? "#16a34a" : "var(--line)" }} /> {dept.is_active ? "Active" : "Archived"}
            </span>
            <span className="meta font-mono text-xs">/{dept.slug}</span>
          </div>
          {dept.description ? (
            <p className="narrative mt-1.5 line-clamp-2 text-sm leading-5">{dept.description}</p>
          ) : (
            <p className="meta mt-1.5 italic">No description — add one so students know what this department owns.</p>
          )}
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

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>
          <Users size={12} style={{ color: "var(--text-muted)" }} /> {dept.members} member{dept.members === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1" style={{ borderColor: dept.head_name ? "var(--line)" : "color-mix(in srgb, var(--danger) 24%, transparent)", background: "var(--bg)", color: dept.head_name ? "var(--text)" : "var(--danger)" }}>
          <UserCog size={12} /> {dept.head_name ? `Head: ${dept.head_name}` : "Head vacant"}
          {dept.co_head_name ? ` · Co: ${dept.co_head_name}` : ""}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>
          <Clock3 size={12} /> {dept.last_activity ? new Date(dept.last_activity).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "no activity yet"}
        </span>
        <Link
          href={`/lead/departments/${dept.slug}`}
          prefetch={false}
          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}
        >
          Open workspace <ArrowUpRight size={12} />
        </Link>
      </div>

      {open && (
        <div className="mt-4 grid gap-4 rounded-xl border p-4 animate-in" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>Leadership</p>
            <p className="meta mt-1">A Head or Co-Head must belong to this department. Appointing adds the seat, the membership, the role and the scoped grant together.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <HeadSlot slot="head" label="Head" dept={dept} members={members} appointAction={appointAction} vacateAction={vacateAction} />
              <HeadSlot slot="co_head" label="Co-Head" dept={dept} members={members} appointAction={appointAction} vacateAction={vacateAction} />
            </div>
          </div>

          <form action={action} className="grid gap-3 border-t pt-4" style={{ borderColor: "var(--line)" }}>
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
            <label className="text-xs font-medium" style={{ color: "var(--text)" }}>Slug <span className="font-normal" style={{ color: "var(--text-muted)" }}>· immutable after creation</span>
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
            </div>
          </form>
        </div>
      )}
    </li>
  );
}
