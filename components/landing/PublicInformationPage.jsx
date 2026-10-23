import { PublicFooter } from "./PublicFooter";
import "./public-information.css";

// Shared only by the public Privacy, Terms, and Contact reading pages.
export function PublicInformationPage({ kicker, title, lede, published, sections, children }) {
  return (
    <>
      <main id="main" className="loom-information">
        <header className="information-hero">
          <div className="information-wrap">
            <p className="information-eyebrow">{kicker}</p>
            <h1>{title}</h1>
            <p className="information-intro">{lede}</p>
          </div>
        </header>
        <div className="information-wrap information-layout">
          <aside className="information-sidebar">
            <p className="information-published">Published {published} · chapter review pending</p>
            <nav aria-label={`${kicker} sections`}>
              <ol>
                {sections.map(({ id, title: sectionTitle }) => (
                  <li key={id}><a href={`#${id}`}>{sectionTitle}</a></li>
                ))}
              </ol>
            </nav>
          </aside>
          <div className="information-copy">{children}</div>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
