// Date labels for server-rendered pages.
//
// WHY THESE MUST RUN ON THE SERVER ONLY
// A page that is server-rendered and then hydrated renders twice: once in the
// Node process, once in the browser. `new Date()` and `toLocaleDateString()`
// resolve against the *ambient* timezone of whichever process is asking, and
// those two processes routinely disagree -- a Vercel function runs UTC while
// most readers here are IST, so for five and a half hours every day the two
// sides are on different calendar dates. A label computed during render can
// therefore say "Today" on the server and "Tomorrow" in the browser, and React
// treats that text difference as a hydration mismatch: it throws away the
// server HTML and re-renders the tree on the client (React error #418).
//
// The rule that removes the whole class of bug: compute the label where the data
// is read (the server component) and pass the finished string down as a prop.
// Never recompute a relative date inside a component that also renders on the
// client.
//
// `now` is injectable so the boundary rules ("Tomorrow", the 6-vs-7-day switch
// from weekday name to calendar date) are testable without mocking the clock.
// Keep the output byte-identical to what the student dashboard has always shown:
// the labels are asserted in tests/dates.test.js and were verified against the
// rendered page when this moved out of the client component.

const LABEL_LOCALE = "en-IN";

export function relDay(iso, now = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return d.toLocaleDateString(LABEL_LOCALE, { weekday: "long" });
  return d.toLocaleDateString(LABEL_LOCALE, { month: "short", day: "numeric" });
}

export function relShort(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(LABEL_LOCALE, { month: "short", day: "numeric" });
}
