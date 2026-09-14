export function PageHeader({ kicker, title, desc, action }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <p className="meta">{kicker}</p>}
        <h1 className="h-product mt-2.5" style={{ fontSize: "1.65rem" }}>{title}</h1>
        {desc && <p className="narrative mt-2.5" style={{ fontSize: "0.9rem" }}>{desc}</p>}
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
    <div className="mx-auto max-w-xl py-10 text-center">
      <p className="meta" style={{ color: "var(--accent)" }}>Empty — for now</p>
      <p className="display display-md mt-3">{title}</p>
      {body && <p className="narrative mx-auto mt-3 text-center">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Stat({ label, value }) {
  return (
    <div className="stat-plain">
      <p className="figure figure-mono">{value}</p>
      <span className="max-w-40 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{label}</span>
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
