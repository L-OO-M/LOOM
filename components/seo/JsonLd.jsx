import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, absoluteUrl, siteUrl } from "@/lib/seo";
import { SITE_SOCIAL } from "@/lib/site";

/**
 * Renders JSON-LD structured data. Pass plain serializable objects only —
 * never user input. Rendered with dangerouslySetInnerHTML because React
 * escapes `<script>` children, which would corrupt the JSON.
 */
/**
 * Serialize JSON-LD safely for inline <script> use. JSON.stringify alone can
 * emit a literal "</script>" from user-controlled text and terminate the tag.
 * Escaping "<" as \u003c keeps the JSON valid while preventing breakout.
 */
export function toJsonLdString(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: toJsonLdString(data) }}
    />
  );
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    // `name` is the entity a search engine has to disambiguate from the video
    // product that dominates the word "Loom". Keep it the bare brand and put
    // the expansion in alternateName rather than inventing a compound name.
    name: SITE_NAME,
    alternateName: "Learning Opportunity Open Source Mentorship",
    slogan: SITE_TAGLINE,
    url: siteUrl(),
    logo: absoluteUrl("/logo.png"),
    description: SITE_DESCRIPTION,
    // The project's public profiles. This is the one claim of ownership the
    // site can make today: the code organisation and the chapter's Instagram.
    // Add others only when they really exist.
    sameAs: [SITE_SOCIAL.github, SITE_SOCIAL.instagram]
  };
}

export function webSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: siteUrl()
  };
}

export function faqPageSchema(faqs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: (faqs || []).map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer }
    }))
  };
}

export function itemListSchema({ name, items }) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: (items || []).map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: item.url,
      name: item.name
    }))
  };
}

export function breadcrumbSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: (items || []).map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url
    }))
  };
}

export function aboutPageSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: `About ${SITE_NAME}`,
    url: absoluteUrl("/about"),
    description: SITE_DESCRIPTION,
    inLanguage: "en-IN",
    about: organizationSchema()
  };
}

/**
 * A public index page (events, departments) as a CollectionPage.
 *
 * `items` are { name, url } and must come from rows the page already renders --
 * this is a machine-readable echo of the visible list, not a second data source
 * that could drift from it.
 */
export function collectionPageSchema({ name, path, description, items }) {
  const list = (items || []).filter((i) => i?.name && i?.url);
  const page = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    url: absoluteUrl(path),
    inLanguage: "en-IN",
    about: organizationSchema()
  };
  if (description) page.description = description;
  if (list.length > 0) {
    page.mainEntity = {
      "@type": "ItemList",
      name,
      numberOfItems: list.length,
      itemListElement: list.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: item.url,
        name: item.name
      }))
    };
  }
  return page;
}

export function webPageSchema({ name, path, description }) {
  const page = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    url: absoluteUrl(path),
    inLanguage: "en-IN",
    about: organizationSchema()
  };
  if (description) page.description = description;
  return page;
}

export function profilePageSchema({ username, name, description, imageUrl, skills }) {
  const clean = String(username || "").trim().toLowerCase();
  const displayName = name || clean;
  const url = absoluteUrl(`/u/${clean}`);
  const person = {
    "@type": "Person",
    name: displayName,
    alternateName: clean,
    url
  };
  if (description) person.description = description;
  if (imageUrl) person.image = imageUrl;
  const knownFor = (skills || []).filter(Boolean).slice(0, 8);
  if (knownFor.length > 0) person.knowsAbout = knownFor;
  const page = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: `${displayName} — ${SITE_NAME}`,
    url,
    inLanguage: "en-IN",
    mainEntity: person
  };
  if (description) page.description = description;
  if (imageUrl) page.image = imageUrl;
  return page;
}
