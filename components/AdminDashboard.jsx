"use client";

import { motion, AnimatePresence } from "motion/react";
import { useTab } from "@/components/AppShell";
import { Users, Flag, ScrollText, BarChart3 } from "lucide-react";

export function AdminDashboard({ activeCount, eventCount, flags, auditEntries }) {
  const { activeTab } = useTab();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <AnimatePresence mode="wait">
        {activeTab === "overview" && (
          <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            <div className="rounded-2xl border p-7" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Admin overview</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--text)" }}>
                College growth signal
              </h1>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <AdminStat icon={Users} label="Active students" value={activeCount} />
                <AdminStat icon={BarChart3} label="GitHub events today" value={eventCount} />
                <AdminStat icon={Flag} label="Roadmap completion" value="—" />
                <AdminStat icon={ScrollText} label="Review recommended" value="—" />
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "flags" && (
          <motion.div key="flags" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            <h2 className="mb-5 text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>Feature flags</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {flags.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>None configured</p>}
              {flags.map((flag) => (
                <div key={flag.key} className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{flag.key.replaceAll("_", " ")}</span>
                  <span
                    className="rounded-md px-2.5 py-0.5 text-xs font-semibold"
                    style={{
                      background: flag.enabled ? "var(--text)" : "transparent",
                      color: flag.enabled ? "var(--bg)" : "var(--text-muted)",
                      border: flag.enabled ? "none" : "1px solid var(--line)"
                    }}
                  >
                    {flag.enabled ? "On" : "Off"}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === "audit" && (
          <motion.div key="audit" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            <h2 className="mb-5 text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>Audit log</h2>
            {auditEntries.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>No audit entries yet</p>}
            {auditEntries.length > 0 && (
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)" }}>
                {auditEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid gap-1 border-b px-5 py-4 last:border-b-0 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <p className="text-sm font-medium capitalize" style={{ color: "var(--text)" }}>
                      {entry.action.replaceAll("_", " ")}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{entry.actor_id}</p>
                    <p className="text-xs sm:text-right" style={{ color: "var(--text-muted)" }}>
                      {new Date(entry.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function AdminStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
        {Icon && <Icon size={14} strokeWidth={1.5} />}
        {label}
      </div>
      <p className="mt-2 font-mono text-xl font-semibold" style={{ color: "var(--text)" }}>{value}</p>
    </div>
  );
}