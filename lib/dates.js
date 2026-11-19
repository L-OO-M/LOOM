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
const DISPLAY_TIME_ZONE = "Asia/Kolkata";

const calendarParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function calendarDay(date) {
  const parts = Object.fromEntries(
    calendarParts
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

export function relDay(iso, now = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.round((calendarDay(d) - calendarDay(now)) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) {
    return d.toLocaleDateString(LABEL_LOCALE, {
      timeZone: DISPLAY_TIME_ZONE,
      weekday: "long",
    });
  }
  return d.toLocaleDateString(LABEL_LOCALE, {
    timeZone: DISPLAY_TIME_ZONE,
    month: "short",
    day: "numeric",
  });
}

export function relShort(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(LABEL_LOCALE, {
    timeZone: DISPLAY_TIME_ZONE,
    month: "short",
    day: "numeric",
  });
}

/**
 * Absolute timestamp for a server-rendered label ("Nov 17, 9:46 pm").
 *
 * Same rule as above: call this on the server and pass the string down. The
 * admin dashboard used to call toLocaleString() inside its own render, which
 * meant the HTML was written in the server's timezone and hydrated in the
 * browser's -- five and a half hours a day those disagree and React throws the
 * whole tree away (error #418).
 */
export function stamp(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(LABEL_LOCALE, {
    timeZone: DISPLAY_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Long "today" label for a masthead ("Tuesday, November 17, 2026"). */
export function todayLong(now = new Date()) {
  return now.toLocaleDateString(LABEL_LOCALE, {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
