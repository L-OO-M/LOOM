"use client";

import { useEffect, useState } from "react";
import { Meta } from "@/components/loom/primitives";
import { ActivityStream } from "@/components/loom/Evidence";

async function api(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json().catch(() => ({ ok: false }));
}

/* Your departments: Explore Domains (instant join), one-click Core requests,
   the department feed, and a self-serve contribution log. Everything here
   reads and writes the membership + announcement + ledger APIs. */
export function DepartmentsSection() {
  const [depts, setDepts] = useState(null);
  const [feed, setFeed] = useState(null);
  const [log, setLog] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const [d, a, c] = await Promise.all([api("/api/departments"), api("/api/announcements"), api("/api/contributions")]);
    if (d?.ok) setDepts(d.data.departments);
    if (a?.ok) setFeed(a.data.announcements);
    if (c?.ok) setLog(c.data.contributions);
  }
  useEffect(() => { load(); }, []);

  async function act(label, fn) {
    setBusy(label);
    setMsg("");
    const data = await fn().catch(() => ({ ok: false }));
    setBusy("");
    if (data?.ok) {
      setMsg("Done ✓");
      load();
    } else {
      setMsg("That didn't go through — try again");
    }
  }

  const mine = (depts || []).filter((d) => d.my_level);
  const open = (depts || []).filter((d) => !d.my_level);

  return (
    <section aria-label="Your departments">
      <Meta>Your departments</Meta>
      {msg && <p className="mt-2 text-xs font-semibold" style={{ color: msg.includes("✓") ? "var(--accent)" : "var(--danger)" }}>{msg}</p>}

      {depts === null ? (
        <div className="mt-3 h-20 animate-pulse rounded-2xl border" style={{ borderColor: "var(--line)" }} />
      ) : (
        <>
          {mine.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {mine.map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--line)", color: "var(--text)" }}>
                  {d.name}
                  <span className="rounded-full px-2 py-0.5 font-mono text-[10px]" style={{ background: "var(--accent)", color: "#101314" }}>{d.my_level}</span>
                  {d.my_level === "general" && !d.core_requested && (
                    <button
                      disabled={busy === d.id}
                      onClick={() => act(d.id, () => api(`/api/departments/${d.id}/request-core`, "POST"))}
                      className="font-semibold underline decoration-dotted underline-offset-2 disabled:opacity-50"
                      style={{ color: "var(--accent)" }}
                    >
                      {busy === d.id ? "…" : "Request Core"}
                    </button>
                  )}
                  {d.my_level === "general" && d.core_requested && (
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Core requested</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {open.length > 0 && (
            <div className="mt-4">
              <p className="meta">Explore domains — joining is instant, no approval</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {open.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{d.name}</span>
                      <span className="meta">{d.members} member{d.members === 1 ? "" : "s"}</span>
                    </span>
                    <button
                      disabled={busy === d.id}
                      onClick={() => act(d.id, () => api(`/api/departments/${d.id}/join`, "POST"))}
                      className="btn-ink shrink-0 !py-1.5 !text-xs disabled:opacity-50"
                    >
                      {busy === d.id ? "Joining…" : "Join"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mine.length === 0 && open.length === 0 && (
            <p className="narrative mt-3">No departments exist in your chapter yet. Once your chapter staffs them, they appear here.</p>
          )}
        </>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <Meta>Department feed</Meta>
          {!feed ? (
            <div className="mt-3 h-20 animate-pulse rounded-2xl border" style={{ borderColor: "var(--line)" }} />
          ) : feed.length === 0 ? (
            <p className="narrative mt-3">Quiet for now. Announcements from your departments and leads land here.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {feed.slice(0, 4).map((a) => (
                <li key={a.id} className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <p className="meta">{a.scope}{a.department_name ? ` · ${a.department_name}` : ""}{a.author_name ? ` · ${a.author_name}` : ""}</p>
                  <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>{a.title}</p>
                  {a.body && <p className="mt-1 line-clamp-2 text-sm" style={{ color: "var(--text-muted)" }}>{a.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Meta>Your contribution log</Meta>
            <LogForm departments={mine} onDone={load} />
          </div>
          {!log ? (
            <div className="mt-3 h-20 animate-pulse rounded-2xl border" style={{ borderColor: "var(--line)" }} />
          ) : log.length === 0 ? (
            <p className="narrative mt-3">Nothing logged yet. Log your first project, competition, certificate, or event — this ledger feeds your profile, certificates, and reports.</p>
          ) : (
            <div className="mt-3">
              <ActivityStream items={log.slice(0, 5).map((c) => ({
                text: `${c.title}`,
                meta: `${c.kind}${c.department_name ? ` · ${c.department_name}` : ""}`
              }))} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function LogForm({ departments, onDone }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("project");
  const [departmentId, setDepartmentId] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button onClick={() => { setOpen(true); setDepartmentId(departments[0]?.id || ""); }} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
        + Log work
      </button>
    );
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const data = await api("/api/contributions", "POST", { title, kind, departmentId: departmentId || null }).catch(() => ({ ok: false }));
    setBusy(false);
    if (data?.ok) {
      setTitle("");
      setOpen(false);
      onDone();
    }
  }
  const input = { borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14, width: "100%" };
  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 rounded-xl border p-4" style={{ borderColor: "var(--line)" }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} placeholder="What did you do?" style={input} aria-label="Contribution title" />
      <div className="grid grid-cols-2 gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={input} aria-label="Kind">
          <option value="project">Project</option>
          <option value="competition">Competition</option>
          <option value="certification">Certification</option>
          <option value="event">Event</option>
        </select>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={input} aria-label="Department">
          <option value="">No department</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button disabled={busy} className="btn-ink !py-1.5 !text-xs disabled:opacity-50">{busy ? "Logging…" : "Log it"}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost !py-1.5 !text-xs">Cancel</button>
      </div>
    </form>
  );
}
