export default function AdminOverviewLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="border-b pb-6 pt-2" style={{ borderColor: "var(--line)" }}>
        <div className="h-5 w-48 animate-pulse rounded-full" style={{ background: "var(--line)" }} />
        <div className="mt-4 h-8 w-2/3 max-w-xl animate-pulse rounded-lg" style={{ background: "var(--line)" }} />
        <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded" style={{ background: "var(--line)" }} />
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <div className="h-4 w-36 animate-pulse rounded" style={{ background: "var(--line)" }} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="h-24 animate-pulse rounded-xl" style={{ background: "var(--line)" }} />
              <div className="h-24 animate-pulse rounded-xl" style={{ background: "var(--line)" }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} />
    </div>
  );
}
