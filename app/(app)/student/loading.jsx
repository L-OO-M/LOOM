export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="skel h-[220px] w-full rounded-3xl" />
      <div className="mt-8 grid gap-4 sm:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => <div key={i} className="skel h-10" />)}
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <div className="skel h-40" />
          <div className="skel h-40" />
          <div className="skel h-64" />
        </div>
        <div className="skel h-[520px]" />
      </div>
    </main>
  );
}
