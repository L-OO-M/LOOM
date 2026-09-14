// Route-level suspense fallback: paints instantly on every tab switch while
// the dashboard's server queries stream in, so navigation never looks frozen.
export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-24 sm:px-6" aria-hidden="true">
      <div className="skel mb-3" style={{ height: 18, width: "38%" }} />
      <div className="skel mb-8" style={{ height: 44, width: "62%" }} />
      <div className="grid gap-4 md:grid-cols-3">
        {[100, 100, 100].map((h, i) => (
          <div key={i} className="skel" style={{ height: h }} />
        ))}
      </div>
      <div className="skel mt-4" style={{ height: 220 }} />
    </div>
  );
}
