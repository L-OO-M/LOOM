"use client";

import { useState } from "react";

function FaqCard({ item, duplicate = false, Title = "h2" }) {
  return (
    <article className="faq-card">
      {item.number && <span className="faq-number">{item.number}</span>}
      <Title>{item.question}</Title>
      <p>{item.answer}</p>
      {item.cta && <a className="faq-account" href="/register" tabIndex={duplicate ? -1 : undefined}>{item.cta}</a>}
    </article>
  );
}

export default function FaqSection({ data, headingLevel: Heading = "h1" }) {
  // Card titles sit one level below the section title, so the outline never
  // skips a level (h1 -> h3 was flagged by axe as heading-order).
  const CardTitle = Heading === "h1" ? "h2" : "h3";
  // The marquee moves on its own, so it needs a visible way to stop it —
  // hover/focus pausing alone is not discoverable (WCAG 2.2.2).
  const [paused, setPaused] = useState({});
  return (
    <div className="faq-layout">
      <div className="faq-header">
        {data.eyebrow && <p className="faq-eyebrow">{data.eyebrow}</p>}
        <Heading className="faq-title">{data.mainTitle}</Heading>
        <p className="faq-subtitle">{data.mainSubtitle}</p>
      </div>
      <div className="faq-rows">
        {data.rows.map(row => (
          <div key={row.id}>
            <div className="faq-row-head">
              <button
                type="button"
                className="faq-pause"
                aria-pressed={!!paused[row.id]}
                aria-label={`${paused[row.id] ? "Resume" : "Pause"} scrolling questions`}
                onClick={() => setPaused(p => ({ ...p, [row.id]: !p[row.id] }))}
              >
                {paused[row.id] ? "Play" : "Pause"}
              </button>
            </div>
            <div className="scroller-mask">
              <div
                className="faq-track"
                data-direction={row.direction}
                data-paused={paused[row.id] ? "true" : undefined}
                style={{ "--faq-duration": row.speed || "40s" }}
              >
                <div className="faq-group">{row.faqItems.map(item => <FaqCard key={item.id} item={item} Title={CardTitle} />)}</div>
                <div className="faq-group" aria-hidden="true" inert>{row.faqItems.map(item => <FaqCard key={item.id} item={item} duplicate Title={CardTitle} />)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
