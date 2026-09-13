export function PageHeader({ kicker, title, desc, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <p className="kicker">{kicker}</p>}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--text)" }}>{title}</h1>
        {desc && <p className="mt-2 max-w-xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border p-6 ${className}`} style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      {children}
    </div>
  );
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="rounded-2xl border p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{title}</p>
      {body && <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: "var(--text-muted)" }}>{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stat({ label, value }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="mt-2 font-mono text-xl font-semibold" style={{ color: "var(--text)" }}>{value}</p>
    </div>
  );
}

export function PrimaryLink({ href, children }) {
  return (
    <a href={href} className="btn-ink">
      {children}
    </a>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}

export const inputStyle = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "var(--bg-muted)",
  color: "var(--text)",
  padding: "9px 12px",
  fontSize: 14
};
