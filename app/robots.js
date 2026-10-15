import { absoluteUrl } from "@/lib/seo";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about", "/faq", "/events", "/domains", "/verify/", "/u/", "/api/og/", "/llms.txt"],
        disallow: ["/api/", "/admin", "/student", "/lead", "/login", "/register", "/setup", "/auth/"]
      }
    ],
    sitemap: absoluteUrl("/sitemap.xml")
  };
}
