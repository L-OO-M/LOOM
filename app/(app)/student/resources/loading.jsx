export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6">
      <div className="mt-6">
        <div className="skel h-5 w-32" />
        <div className="skel mt-3 h-8 w-72" />
        <div className="skel mt-4 h-4 w-full max-w-xl" />
      </div>
      <div className="mt-6 flex gap-3">
        <div className="skel h-10 flex-1" />
        <div className="skel h-10 flex-1" />
        <div className="skel h-10 flex-1" />
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="skel h-28" />
        <div className="skel h-28" />
      </div>
      <div className="mt-8 space-y-3">
        <div className="skel h-20" />
        <div className="skel h-20" />
        <div className="skel h-20" />
      </div>
    </main>
  );
}
