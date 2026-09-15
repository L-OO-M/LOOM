import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl, siteUrl } from "@/lib/seo";

/**
 * Renders JSON-LD structured data. Pass plain serializable objects only —
 * never user input. Rendered with dangerouslySetInnerHTML because React
 * escapes `<script>` children, which would corrupt the JSON.
 */
export function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: `${SITE_NAME} — Learning Operating System for colleges`,
    url: siteUrl(),
    logo: absoluteUrl("/logo.png"),
    description: SITE_DESCRIPTION
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
