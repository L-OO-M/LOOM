import { describe, expect, it } from "vitest";
import {
  aboutPageSchema,
  breadcrumbSchema,
  organizationSchema,
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
  });

  it("names the organization exactly once and links only the real profiles", () => {
    const schema = organizationSchema();
    expect(schema).toMatchObject({
      "@type": "Organization",
      name: "LOOM",
      alternateName: "Learning Opportunity Open Source Mentorship",
      sameAs: ["https://github.com/L-OO-M", "https://www.instagram.com/lets_loom._/"]
    });
    // sameAs is a claim of ownership. It may only ever list profiles that exist
    // and belong to this project, so the list is pinned rather than free-form.
    expect(schema.sameAs).toHaveLength(2);
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
