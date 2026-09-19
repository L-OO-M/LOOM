export default function ResourcesLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="h-6 w-40 animate-pulse rounded" style={{ background: "var(--line)" }} />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} />)}</div>
      <div className="mt-6 h-96 animate-pulse rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} />
    </div>
  );
}
