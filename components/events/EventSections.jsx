/* Long-form event blocks.
 *
 * Shared by the public event page and the signed-in student page so a brief is
 * written once and reads the same in both places. Server component: sections are
 * already validated by lib/event-page.js before they reach this renderer.
 */

import { sectionLabel } from "@/lib/event-page";

export function EventSectionNav({ sections = [] }) {
  if (sections.length < 2) return null;
  return (
    <nav aria-label="On this page" className="flex flex-wrap gap-2">
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#section-${section.id}`}
          className="rounded-full border px-3 py-1.5 text-xs font-semibold"
          style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
        >
          {section.heading}
        </a>
      ))}
    </nav>
  );
}

export function EventSections({ sections = [], className = "" }) {
  if (!sections.length) return null;
  return (
    <div className={`space-y-10 ${className}`}>
      {sections.map((section) => {
        const headingId = `section-heading-${section.id}`;
        return (
          <section key={section.id} id={`section-${section.id}`} aria-labelledby={headingId} className="scroll-mt-24">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--accent)" }}>
              {sectionLabel(section.type)}
            </p>
            <h2 id={headingId} className="font-display mt-2 text-2xl font-medium" style={{ color: "var(--text)" }}>
              {section.heading}
            </h2>
            {section.body ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-7" style={{ color: "var(--text-muted)" }}>
                {section.body}
              </p>
            ) : null}
            {section.bullets.length > 0 ? (
              <ul className="mt-4 space-y-2.5">
                {section.bullets.map((bullet, index) => (
                  <li key={`${section.id}-b${index}`} className="flex gap-3 text-sm leading-6" style={{ color: "var(--text)" }}>
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {section.links.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {section.links.map((link) => (
                  <a
                    key={`${section.id}-${link.url}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border px-3 py-1.5 text-xs font-semibold hover:underline"
                    style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                  >
                    {link.label} ↗
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
