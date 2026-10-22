"use client";

function FaqCard({ item, duplicate = false }) {
  return (
    <article className="faq-card">
      {item.number && <span className="faq-number">{item.number}</span>}
      <h3>{item.question}</h3>
      <p>{item.answer}</p>
      {item.cta && <a className="faq-account" href="/register" tabIndex={duplicate ? -1 : undefined}>{item.cta}</a>}
    </article>
  );
}

export default function FaqSection({ data, headingLevel: Heading = "h1" }) {
  return (
    <div className="faq-layout">
      <div className="faq-header">
        {data.eyebrow && <p className="faq-eyebrow">{data.eyebrow}</p>}
        <Heading className="faq-title">{data.mainTitle}</Heading>
        <p className="faq-subtitle">{data.mainSubtitle}</p>
      </div>
      <div className="faq-rows">
        {data.rows.map(row => (
          <div className="scroller-mask" key={row.id}>
            <div className="faq-track" data-direction={row.direction} style={{ "--faq-duration": row.speed || "40s" }}>
              <div className="faq-group">{row.faqItems.map(item => <FaqCard key={item.id} item={item} />)}</div>
              <div className="faq-group" aria-hidden="true" inert>{row.faqItems.map(item => <FaqCard key={item.id} item={item} duplicate />)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
