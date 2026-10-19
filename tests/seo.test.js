import { describe, expect, it } from "vitest";
import {
  aboutPageSchema,
  breadcrumbSchema,
  profilePageSchema,
  toJsonLdString,
  webPageSchema
} from "@/components/seo/JsonLd";

describe("structured data helpers", () => {
  it("serializes JSON-LD without a literal script breakout", () => {
    const output = toJsonLdString({ text: "</script><script>alert(1)</script>" });
    expect(output).not.toContain("</script>");
    expect(output).toContain("\\u003c/script>");
  });

  it("builds breadcrumbs with stable positions", () => {
    expect(
      breadcrumbSchema([
        { name: "Home", url: "https://example.test/" },
        { name: "Events", url: "https://example.test/events" }
      ])
    ).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home" },
        { "@type": "ListItem", position: 2, name: "Events" }
      ]
    });
  });

  it("describes the about page without inventing ownership details", () => {
    const schema = aboutPageSchema();
    expect(schema).toMatchObject({ "@type": "AboutPage", inLanguage: "en-IN" });
    expect(schema.about).toMatchObject({ "@type": "Organization" });
    expect(schema).not.toHaveProperty("foundingDate");
    expect(schema).not.toHaveProperty("sameAs");
  });

  it("describes a public profile only from available profile fields", () => {
    const schema = profilePageSchema({
      username: "Aanya-Dev",
      name: "Aanya",
      description: "Builder",
      imageUrl: "https://example.test/card.png",
      skills: ["React", "", "DSA"]
    });
    expect(schema).toMatchObject({
      "@type": "ProfilePage",
      mainEntity: {
        "@type": "Person",
        name: "Aanya",
        alternateName: "aanya-dev",
        knowsAbout: ["React", "DSA"]
      }
    });
  });

  it("omits absent profile fields instead of emitting empty schema properties", () => {
    const schema = profilePageSchema({ username: "solo" });
    expect(schema.mainEntity).not.toHaveProperty("description");
    expect(schema.mainEntity).not.toHaveProperty("image");
    expect(schema.mainEntity).not.toHaveProperty("knowsAbout");
  });

  it("describes legal pages without asserting unpublished contact details", () => {
    const schema = webPageSchema({ name: "Privacy", path: "/privacy", description: "Privacy notice." });
    expect(schema).toMatchObject({ "@type": "WebPage", name: "Privacy" });
    expect(schema).not.toHaveProperty("contactPoint");
  });
});
