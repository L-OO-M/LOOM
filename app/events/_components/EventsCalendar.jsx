import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { EVENT_TYPES, TYPE_LABEL } from "@/lib/events";
import { seatsLeft, whenLabel } from "./EventBits";
import { PublicFooter } from "@/components/landing/PublicFooter";

function filterHref(type, domain) {
  const params = new URLSearchParams();
  if (type !== "all") params.set("type", type);
  if (domain !== "all") params.set("domain", domain);
  return `/events${params.size ? `?${params}` : ""}#calendar`;
}

function AccentArrow({ right = false }) {
  return <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={right ? "M90,10 C80,60 60,80 40,60 C20,40 40,20 60,30 C80,40 70,70 50,80 M65,75 L50,80 L55,65" : "M10,90 C10,40 40,20 60,50 C70,65 80,75 95,70 M80,55 L95,70 L85,85"} /></svg>;
}

function SeatBadge() {
  return <a href="#calendar" className="events-seat-badge" aria-label="Find your seat in the calendar"><svg viewBox="0 0 100 100" className="events-badge-ring" aria-hidden="true"><defs><path id="events-circle" d="M50,50 m-36,0 a36,36 0 1,1 72,0 a36,36 0 1,1 -72,0" /></defs><text><textPath href="#events-circle">CLAIM YOUR SEAT • JOIN AN EVENT •</textPath></text></svg><svg viewBox="0 0 100 100" className="events-badge-arrow" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20,80 Q40,50 30,30 T80,20 M60,10 L80,20 L70,40" /></svg></a>;
}

function CalendarEvent({ event }) {
  const remaining = seatsLeft(event);
  const artwork = ["talk", "workshop", "hackathon", "contest"].includes(event.event_type) ? event.event_type : event.event_type === "mentoring" ? "workshop" : "contest";
  return (
    <article className={`events-card events-card--${artwork} events-surface-grid`}>
      <Image className="events-card-image" src={`/events/event-${artwork}.png`} width={816} height={816} alt="" />
      <div className="events-card-content">
        <span className="events-type-badge"><i />{TYPE_LABEL[event.event_type] || "General"}</span>
        <h3>{event.title}</h3>
        <p className="events-card-description">{event.description || "The full programme will be shared soon. Open this event for the latest details."}</p>
        <dl className="events-card-facts"><dt>When</dt><dd>{whenLabel(event.starts_at)}</dd><dt>Where</dt><dd>{event.is_online ? "Online" : event.location || "Venue announced soon"}</dd><dt>Seats</dt><dd>{remaining === null ? "Open registration" : remaining === 0 ? "Full — waitlist only" : `${remaining} of ${event.capacity} left`}</dd></dl>
        <Link href={`/events/${event.id}`} prefetch={false} className="events-card-cta">Details &amp; registration <ArrowRight size={16} /></Link>
      </div>
    </article>
  );
}

const steps = [
  ["01", "Create your account", "Register with your college email. One form, no approval queue."],
  ["02", "Sign in", "Your dashboard is the hub — roadmap, projects, mentors, and every event you have joined."],
  ["03", "Claim your seat", "Open the event from your dashboard and register. You get a check-in code on the spot."],
  ["04", "Show up, get proof", "Check in with your code. Attendees receive a verifiable certificate they can share anywhere."]
];

export default function EventsCalendar({ events, domains, pastCount, loadError, type, domain }) {
  const filtered = type !== "all" || domain !== "all";
  const next = events[0];
  return (
    <>
    <main id="main" className="loom-events">
      <section className="events-hero" aria-labelledby="events-title">
        <div className="events-hero-stage">
          <div className="events-headline-scene">
            <h1 id="events-title" aria-label="LOOM Events 26/27"><span>LOOM</span><span>EVENTS</span><span>26/27</span></h1>
            <div className="events-glass events-glass--next events-surface-grid"><span className="events-glass-label">NEXT UP</span><div><p>{loadError ? "Calendar temporarily unavailable" : next?.title || "Your next chapter is coming"}</p><small>{next ? `${TYPE_LABEL[next.event_type] || "Event"} • ${whenLabel(next.starts_at)}` : "New events will appear here"}</small></div></div>
            <div className="events-glass events-glass--season events-surface-grid"><span className="events-glass-label">SEASON 26/27</span><div><p>{loadError ? "Check back soon" : `${events.length} ${filtered ? "matching" : "upcoming"} events`}</p><small>Workshops • hackathons • talks • CTFs</small></div></div>
            <div className="events-accent-arrow events-accent-arrow--left"><AccentArrow /></div><div className="events-accent-arrow events-accent-arrow--right"><AccentArrow right /></div>
            <SeatBadge />
          </div>
        </div>
      </section>

      <section id="calendar" className="events-wrap events-calendar" aria-labelledby="calendar-title">
        <div className="events-section-heading"><span className="events-section-label">Chapter calendar</span><h2 id="calendar-title">Events we actually run</h2><p>Workshops, hackathons, talks, mentoring sessions and contests — with real dates, real venues, and real seats. Everything here is on the chapter calendar, and registering takes one click from your dashboard.</p></div>
        <div className="events-filter-row"><nav className="events-filters" aria-label="Filter events by type">{["all", ...EVENT_TYPES, "general"].map(eventType => <Link key={eventType} href={filterHref(eventType, domain)} prefetch={false} className={`events-filter${type === eventType ? " is-active" : ""}`} aria-current={type === eventType ? "true" : undefined}>{eventType === "all" ? "Everything" : TYPE_LABEL[eventType] || "General"}</Link>)}</nav><span className="events-calendar-count" role="status">{loadError ? "Calendar unavailable" : `${events.length} ${events.length === 1 ? "event" : "events"}`}</span></div>
        {domains.length > 0 && <nav className="events-domain-filters" aria-label="Filter events by domain"><span>DOMAIN</span>{["all", ...domains].map(d => <Link key={d} href={filterHref(type, d)} prefetch={false} aria-current={domain === d ? "true" : undefined}>{d === "all" ? "All domains" : d.replace(/_/g, " ")}</Link>)}</nav>}
        {events.length > 0 ? <div className="events-card-grid">{events.map(event => <CalendarEvent key={event.id} event={event} />)}</div> : <div className="events-empty"><CalendarDays size={36} aria-hidden="true" /><h3>{loadError ? "The calendar is taking a moment." : filtered ? "Nothing matches that filter right now." : "No upcoming events right now."}</h3><p>{loadError ? "We couldn’t load the event calendar. Please try again in a little while." : filtered ? "No events on this track right now — check the other filters." : "New workshops, talks, and gatherings will appear here when they are scheduled."}</p>{loadError ? <a href="/events#calendar" className="events-filter">Try again</a> : filtered ? <Link href="/events#calendar" prefetch={false} className="events-filter">Clear filters</Link> : <Link href="/domains" prefetch={false} className="events-filter">Explore the domains</Link>}</div>}
        {pastCount > 0 && <p className="events-past-note">{pastCount} {pastCount === 1 ? "event has" : "events have"} already brought this chapter together. More to come.</p>}
      </section>

      <section id="join" className="events-wrap events-joining" aria-labelledby="joining-title">
        <div className="events-section-heading"><span className="events-section-label events-section-label--lime">Joining</span><h2 id="joining-title">How to get into an event</h2><p>No invite codes, no email chains. Registration happens inside your account so attendance, certificates, and your contribution record all stay connected.</p></div>
        <ol className="events-steps">{steps.map(([number, title, description]) => <li key={number} className="events-surface-grid"><span>{number}</span><h3>{title}</h3><p>{description}</p></li>)}</ol>
        <div className="events-closing events-surface-grid"><p>{!loadError && events.some(event => seatsLeft(event) !== 0) ? "Seats are open — claim yours." : "Your next event starts here."}</p><a href="#calendar">Back to the calendar</a></div>
      </section>
    </main>
    <PublicFooter />
    </>
  );
}
