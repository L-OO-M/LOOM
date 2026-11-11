"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, Send, FileText, Check } from "lucide-react";

const input = {
  width: "100%", borderRadius: 10, border: "1px solid var(--line)",
  background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14
};

async function api(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json().catch(() => ({ ok: false }));
}

function audienceLabel(a) {
  if (a.scope === "society") return "Whole chapter";
  if (a.vertical) return `${a.vertical.replace("_", "-")} vertical`;
  return a.department_name || "Department";
}

function when(value) {
  if (!value) return null;
  return new Date(value).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });
}

export function AnnouncementComposer({ departments = [], canChapter = false, initialAnnouncements = [] }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState(canChapter ? "society" : "department");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || "");
  const [expiresAt, setExpiresAt] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [announcements, setAnnouncements] = useState(initialAnnouncements);

  const drafts = useMemo(() => announcements.filter((a) => a.status === "draft"), [announcements]);
  const published = useMemo(() => announcements.filter((a) => a.status === "published").slice(0, 5), [announcements]);

  async function refresh() {
    const data = await api("/api/announcements?manage=1");
    if (data?.ok) setAnnouncements(data.data.announcements || []);
  }

  async function submit(status) {
    if (title.trim().length < 3) { setMsg("Give the announcement a title of at least 3 characters"); return; }
    if (scope === "department" && !departmentId) { setMsg("Pick a department for this audience"); return; }
    setBusy(status);
    setMsg("");
    const data = await api("/api/announcements", "POST", {
      scope,
      departmentId: scope === "department" ? departmentId : null,
      vertical: null,
      title: title.trim(),
      body: body.trim(),
      status,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null
    });
    setBusy("");
    if (!data?.ok) {
      setMsg(data?.error?.message || "That did not go through - try again");
      return;
    }
    setTitle("");
    setBody("");
    setExpiresAt("");
    setPreview(false);
    setMsg(status === "published" ? "Published. Students in this audience can see it now." : "Draft saved. Only leads and admins can see it.");
    await refresh();
  }

  async function publishDraft(a) {
    setBusy(a.id);
    setMsg("");
    const data = await api(`/api/announcements/${a.id}`, "PATCH", { status: "published" });
    setBusy("");
    if (!data?.ok) {
      setMsg(data?.error?.message || "Could not publish that draft");
      return;
    }
    setMsg("Published. Students in this audience can see it now.");
    await refresh();
  }

  const success = msg.startsWith("Published") || msg.startsWith("Draft saved");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <section className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Announcement composer">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Write an announcement</h2>
          <button onClick={() => setPreview((v) => !v)} className="btn-ghost !py-1 inline-flex items-center gap-1 text-xs">
            {preview ? <EyeOff size={12} /> : <Eye size={12} />} {preview ? "Edit" : "Preview"}
          </button>
        </div>

        {msg && (
          <p className="mt-3 rounded-lg border px-3 py-2 text-xs" style={success
            ? { borderColor: "color-mix(in srgb, #16a34a 25%, transparent)", background: "color-mix(in srgb, #16a34a 9%, var(--bg))", color: "#16a34a" }
            : { borderColor: "color-mix(in srgb, var(--danger) 25%, transparent)", background: "color-mix(in srgb, var(--danger) 9%, var(--bg))", color: "var(--danger)" }}>
            {msg}
          </p>
        )}

        {preview ? (
          <article className="mt-4 rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
            <p className="meta">
              {scope === "society" ? "Whole chapter" : departments.find((d) => d.id === departmentId)?.name || "Department"}
              {expiresAt ? ` - expires ${when(expiresAt)}` : ""}
            </p>
            <h3 className="mt-1 text-base font-semibold" style={{ color: "var(--text)" }}>
              {title.trim() || "Untitled announcement"}
            </h3>
            <p className="narrative mt-2 whitespace-pre-wrap text-sm">{body.trim() || "No body yet."}</p>
          </article>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); submit("published"); }}>
            <input
              value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160}
              placeholder="Title - what changed and why it matters" style={input} aria-label="Announcement title"
            />
            <textarea
              value={body} onChange={(e) => setBody(e.target.value)} rows={7} maxLength={4000}
              placeholder="The full message students will read. Plain text, no markdown." style={input} aria-label="Announcement body"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs" style={{ color: "var(--text-muted)" }}>
                Audience
                <select value={scope} onChange={(e) => setScope(e.target.value)} style={input} aria-label="Audience">
                  {canChapter && <option value="society">Whole chapter</option>}
                  <option value="department">One department</option>
                </select>
              </label>
              {scope === "department" ? (
                <label className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Department
                  <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={input} aria-label="Department">
                    {departments.length === 0 && <option value="">No departments you lead</option>}
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
              ) : (
                <label className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Optional expiry
                  <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} style={input} />
                </label>
              )}
            </div>
            {scope === "department" && (
              <label className="block text-xs" style={{ color: "var(--text-muted)" }}>
                Optional expiry
                <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} style={input} />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={Boolean(busy)} className="btn-ink !py-2 inline-flex items-center gap-1.5 text-sm disabled:opacity-50">
                <Send size={13} /> {busy === "published" ? "Publishing..." : "Publish"}
              </button>
              <button type="button" onClick={() => submit("draft")} disabled={Boolean(busy)} className="btn-ghost !py-2 inline-flex items-center gap-1.5 text-sm disabled:opacity-50">
                <FileText size={13} /> {busy === "draft" ? "Saving..." : "Save draft"}
              </button>
            </div>
          </form>
        )}
      </section>

      <aside className="space-y-5" aria-label="Announcement drafts and recent posts">
        <section>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Drafts</h2>
          {drafts.length === 0 ? (
            <p className="narrative mt-2 text-sm">No drafts. Saving one keeps it out of every student feed until you publish.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {drafts.map((a) => (
                <li key={a.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <p className="meta">{audienceLabel(a)}{a.expires_at ? ` - expires ${when(a.expires_at)}` : ""}</p>
                  <p className="mt-0.5 text-sm font-medium" style={{ color: "var(--text)" }}>{a.title}</p>
                  {a.body && <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--text-muted)" }}>{a.body}</p>}
                  <button onClick={() => publishDraft(a)} disabled={busy === a.id} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold disabled:opacity-50" style={{ color: "var(--accent)" }}>
                    <Check size={12} /> {busy === a.id ? "Publishing..." : "Publish now"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Recently published</h2>
          {published.length === 0 ? (
            <p className="narrative mt-2 text-sm">Nothing published yet. The first post lands in student notifications and the department feed.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {published.map((a) => (
                <li key={a.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <p className="meta">{audienceLabel(a)}{a.published_at ? ` - ${when(a.published_at)}` : ""}</p>
                  <p className="mt-0.5 text-sm font-medium" style={{ color: "var(--text)" }}>{a.title}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
