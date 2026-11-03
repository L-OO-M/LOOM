"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Check, Loader2 } from "lucide-react";
import { Field, inputStyle } from "@/components/ui";

function memberLabel(member) {
  const name = member?.name || member?.github_username || String(member?.user_id || "").slice(0, 8);
  const handle = member?.github_username ? `@${member.github_username}` : String(member?.user_id || "").slice(0, 8);
  return { name, handle, role: member?.role || "student" };
}

// Add a mentor by searching the chapter roster instead of pasting a user id.
// The search reads the tenant-scoped admin students endpoint; the write still
// goes through /api/admin/mentors, which re-checks admin auth and membership.
export function MentorPicker() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(null);
  const [expertise, setExpertise] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setLoadError("");
      try {
        const res = await fetch(`/api/admin/students?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
        const data = await res.json();
        if (id !== requestId.current) return;
        if (!data.ok) {
          setMembers([]);
          setLoadError(data.error?.message || "Could not search the roster.");
          return;
        }
        setMembers(Array.isArray(data.data?.students) ? data.data.students : []);
      } catch {
        if (id !== requestId.current) return;
        setMembers([]);
        setLoadError("Could not reach the roster. Try again.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const selectedLabel = useMemo(() => (selected ? memberLabel(selected) : null), [selected]);

  async function submit(e) {
    e.preventDefault();
    if (!selected) {
      setMsg("Choose a member from the roster first.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/mentors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: selected.user_id, expertise, bio })
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "Could not add this mentor.");
        return;
      }
      setSelected(null);
      setExpertise("");
      setBio("");
      setMsg("Mentor saved.");
      router.refresh();
    } catch {
      setMsg("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Add mentor (promotes a member to mentor)</p>

      <Field label="Find a member">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, GitHub handle, or user id"
            aria-label="Search members to add as a mentor"
            style={{ ...inputStyle, paddingLeft: 34 }}
          />
          {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: "var(--text-muted)" }} aria-hidden="true" />}
        </div>
      </Field>

      {loadError && <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{loadError}</p>}

      <div className="max-h-52 overflow-y-auto rounded-xl border" style={{ borderColor: "var(--line)" }} aria-live="polite">
        {members.length === 0 ? (
          <p className="px-3 py-4 text-xs" style={{ color: "var(--text-muted)" }}>
            {loading ? "Searching the roster…" : loadError ? "Roster unavailable." : "No member matches that search."}
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {members.map((m) => {
              const label = memberLabel(m);
              const isSelected = selected?.user_id === m.user_id;
              return (
                <li key={m.user_id} className="border-b last:border-b-0" style={{ borderColor: "var(--line)" }}>
                  <button
                    type="button"
                    onClick={() => { setSelected(m); setMsg(""); }}
                    aria-pressed={isSelected}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-[var(--bg-muted)]"
                    style={{ background: isSelected ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent" }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium" style={{ color: "var(--text)" }}>{label.name}</span>
                      <span className="block truncate text-xs" style={{ color: "var(--text-muted)" }}>{label.handle} · {label.role.replaceAll("_", " ")}</span>
                    </span>
                    {isSelected && <Check size={15} style={{ color: "var(--accent)" }} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedLabel && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Selected: <strong style={{ color: "var(--text)" }}>{selectedLabel.name}</strong> ({selectedLabel.handle})
        </p>
      )}

      <Field label="Expertise (optional)">
        <input value={expertise} onChange={(e) => setExpertise(e.target.value)} maxLength={200} placeholder="React, APIs, design systems" style={inputStyle} />
      </Field>
      <Field label="Bio (optional)">
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} maxLength={2000} style={inputStyle} />
      </Field>

      {msg && <p role="status" className="text-xs" style={{ color: msg === "Mentor saved." ? "var(--accent)" : "var(--danger)" }}>{msg}</p>}
      <button disabled={busy || !selected} className="btn-ink w-fit disabled:opacity-50">
        {busy ? "Saving…" : "Save mentor"}
      </button>
    </form>
  );
}
