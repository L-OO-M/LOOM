// Standings suspense fallback: mirrors the final board (hero, standing
// card, rows) so tab switches never look frozen or jump layout on resolve.
export default function StandingsLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 sm:px-6" aria-hidden="true">
      <div className="skel mb-3" style={{ height: 14, width: "32%" }} />
      <div className="skel" style={{ height: 44, width: "68%" }} />
      <div className="skel mt-4" style={{ height: 16, width: "52%" }} />
      <div className="mt-8 rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--line)" }}>
        <div className="skel" style={{ height: 12, width: "28%" }} />
        <div className="mt-4 flex items-end justify-between gap-6">
          <div className="skel" style={{ height: 56, width: "30%" }} />
          <div className="skel" style={{ height: 40, width: "24%" }} />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel" style={{ height: 52 }} />
          ))}
        </div>
      </div>
      <div className="mt-8 flex gap-2">
        <div className="skel" style={{ height: 34, width: 220 }} />
        <div className="skel" style={{ height: 34, width: 160 }} />
      </div>
      {[88, 80, 92, 76, 90].map((w, i) => (
        <div key={i} className="skel mt-3" style={{ height: 54, width: `${w}%` }} />
      ))}
    </div>
  );
}
