/**
 * Event unfurl card.
 *
 * Used by app/events/[id]/opengraph-image.jsx. Every value here comes from the
 * event row -- no invented attendance, urgency, or venue. The art is the same
 * deterministic geometry the public banner uses, so a shared link previews the
 * page it actually opens.
 *
 * Satori constraints: explicit px, flex layout only, no CSS grid, and never a
 * bare number as a child (it trips Satori's `children` guard).
 */

import { TYPE_LABEL } from "@/lib/events";
import { bannerFor } from "@/lib/eventArt";

export const EVENT_CARD_SIZE = { width: 1200, height: 630 };

const FIELD = "#0a1628";
const DEEP = "#060d18";
const CREAM = "#f4f1e8";
const GOLD = "#e8c26a";
const MUTED = "rgba(244,241,232,0.64)";
const FAINT = "rgba(244,241,232,0.40)";
const HAIRLINE = "rgba(232,194,106,0.34)";

/** Collapse whitespace and trim to a single line that fits the card. */
export function clip(value, max = 86) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function eventDateLine(value) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

export function seatsLine(event) {
  const capacity = Number(event?.capacity);
  if (!capacity) return "Open registration";
  const taken = Number(event?.registered_count || 0);
  const left = Math.max(0, capacity - taken);
  if (left === 0) return "Full — waitlist";
  return `${left} of ${capacity} seats left`;
}

function isPastEvent(event) {
  if (event?.status === "past") return true;
  const starts = new Date(event?.starts_at).getTime();
  return Number.isFinite(starts) && starts < Date.now();
}

export function EventCard({ event }) {
  const { pal, nodes } = bannerFor(event);
  const type = String(TYPE_LABEL[event?.event_type] || event?.event_type || "Event").toUpperCase();
  const title = clip(event?.title) || "L.O.O.M. event";
  const when = eventDateLine(event?.starts_at);
  const place = clip(event?.is_online ? "Online" : event?.location || "Venue announced soon", 38);
  const seats = seatsLine(event);
  const past = isPastEvent(event);
  const site = String(event?.siteUrl || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        overflow: "hidden",
        fontFamily: "sans-serif",
        color: CREAM,
        background: `linear-gradient(145deg, ${DEEP} 0%, ${FIELD} 58%, ${pal.b} 165%)`
      }}
    >
      {nodes.map((n, i) => (
        <div
          key={`node-${i}`}
          style={{
            position: "absolute",
            left: Math.round((n.x / 100) * EVENT_CARD_SIZE.width),
            top: Math.round((n.y / 100) * EVENT_CARD_SIZE.height),
            width: Math.round(n.r * 6),
            height: Math.round(n.r * 6),
            borderRadius: 9999,
            background: pal.a,
            opacity: n.o
          }}
        />
      ))}

      <div style={{ position: "absolute", inset: 22, border: `1px solid ${HAIRLINE}`, borderRadius: 18 }} />

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "58px 64px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 34, height: 3, background: GOLD }} />
            <div style={{ fontSize: 18, letterSpacing: 7, fontWeight: 700, color: GOLD }}>
              L.O.O.M.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              border: `1px solid ${HAIRLINE}`,
              borderRadius: 9999,
              padding: "9px 18px",
              fontSize: 14,
              letterSpacing: 3,
              fontWeight: 700,
              color: GOLD
            }}
          >
            {type}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 830 }}>
          <div style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.04, letterSpacing: "-1px", color: CREAM }}>
            {title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 22, fontWeight: 700, color: pal.a }}>
            <div>{when}</div>
            <div style={{ color: FAINT }}>·</div>
            <div>{place}</div>
          </div>
          <div style={{ display: "flex", fontSize: 18, color: MUTED }}>
            {past ? "Event concluded" : seats}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, letterSpacing: 3, color: FAINT }}>{site}</div>
          <div
            style={{
              display: "flex",
              borderRadius: 10,
              padding: "11px 18px",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: 1,
              color: FIELD,
              background: past ? FAINT : GOLD
            }}
          >
            {past ? "EVENT CONCLUDED" : "SIGN IN TO CLAIM A SEAT"}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EventCardNotFound() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: DEEP,
        color: MUTED,
        fontSize: 30,
        letterSpacing: 4
      }}
    >
      L.O.O.M. — EVENT NOT FOUND
    </div>
  );
}
