import { absoluteUrl } from "@/lib/seo";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        // `"/"` allows everything by default; the explicit entries document
        // intent for the surfaces that matter most. The Search Console
        // verification file at the root (/google<token>.html) is covered by it
        // and must stay fetchable -- Google fetches it anonymously.
        allow: ["/", "/about", "/faq", "/events", "/domains", "/verify/", "/u/", "/api/og/", "/llms.txt"],
        disallow: ["/api/", "/admin", "/student", "/lead", "/login", "/register", "/setup", "/auth/"]
      }
    ],
    sitemap: absoluteUrl("/sitemap.xml")
  };
}
