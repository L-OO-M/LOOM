"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, ClipboardCheck } from "lucide-react";

function Checklist({ title, note, checklist, userId, busyKey, onToggle }) {
  return (
    <section className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{title}</h3>
        <span className="text-xs font-medium" style={{ color: checklist.outstanding.length ? "var(--danger)" : "var(--accent)" }}>
          {checklist.done}/{checklist.total} done
        </span>
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{note}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
        <div className="h-full rounded-full" style={{ width: `${checklist.pct}%`, background: "var(--accent)" }} />
      </div>
      <ul className="mt-4 space-y-2">
        {checklist.items.map((item) => (
          <li key={item.key}>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3" style={{ borderColor: item.done ? "color-mix(in srgb, var(--accent) 24%, var(--line))" : "var(--line)", background: item.done ? "color-mix(in srgb, var(--accent) 6%, var(--bg))" : "var(--bg-elevated)" }}>
              <input
                type="checkbox"
                checked={item.done}
                disabled={busyKey === item.key}
                onChange={() => onToggle(item.key, !item.done)}
                className="sr-only"
              />
              <span className="mt-0.5 shrink-0" style={{ color: item.done ? "var(--accent)" : "var(--text-muted)" }}>
                {item.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium" style={{ color: "var(--text)" }}>{item.label}</span>
                <span className="mt-0.5 block text-xs leading-5" style={{ color: "var(--text-muted)" }}>{item.detail}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PeopleChecklist({ userId, role, onboarding, offboarding }) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");

  async function toggle(kind, itemKey, done) {
    setBusyKey(itemKey);
    setError("");
    try {
      const res = await fetch(`/api/admin/students/${userId}/checklist`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, itemKey, done })
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) {
        setError(data?.error?.message || "Could not save this checklist item.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error - the item was not saved.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
        <ClipboardCheck size={14} /> People checklist
      </h2>
      <p className="narrative mt-1">
        Onboarding and offboarding for the <strong>{String(role || "student").replaceAll("_", " ")}</strong> role. Offboarding must be clear before the account can close.
      </p>
      {error && <p role="alert" className="mt-3 text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Checklist
          title="Onboarding"
          note="What a member in this role should have done before they are fully operational."
          checklist={onboarding}
          userId={userId}
          busyKey={busyKey}
          onToggle={(key, done) => toggle("onboarding", key, done)}
        />
        <Checklist
          title="Offboarding"
          note={`${offboarding.outstanding.length} outstanding. Every item must be checked before the account can be closed.`}
          checklist={offboarding}
          userId={userId}
          busyKey={busyKey}
          onToggle={(key, done) => toggle("offboarding", key, done)}
        />
      </div>
    </section>
  );
}
