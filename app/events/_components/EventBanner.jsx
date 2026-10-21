/* Generated event banners.
 *
 * No object storage is wired (R2 creds are empty), so we do not fake photos or
 * ship stock imagery that has nothing to do with the event. Instead every event
 * gets a deterministic banner derived from its own id + domain: the same event
 * always renders the same artwork, different events never collide, and it costs
 * zero bytes of upload.
 *
 * Colours come from the landing palette (#0a1628 navy, #e8c26a gold,
 * #3fd2e0 cyan) so it sits correctly next to PageHero on both themes.
 */

import { bannerFor } from "@/lib/eventArt";

export function EventBanner({ event, className = "", ratio = "16 / 9" }) {
  const { pal, nodes, lines } = bannerFor(event);
  const title = event?.title || "Event";
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio: ratio, background: "#0a1628" }}
      role="img"
      aria-label={`Banner artwork for ${title}`}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`bg-${event?.id ?? "x"}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={pal.b} />
            <stop offset="100%" stopColor="#0a1628" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#bg-${event?.id ?? "x"})`} />
        {nodes.map((n, i) => (
          <circle key={`n${i}`} cx={n.x} cy={n.y} r={n.r} fill={pal.a} opacity={n.o} />
        ))}
        {lines.map((l, i) => (
          <line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#f4f1e8" strokeOpacity={l.o} strokeWidth="0.3" />
        ))}
      </svg>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        aria-hidden="true"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")"
        }}
      />
    </div>
  );
}