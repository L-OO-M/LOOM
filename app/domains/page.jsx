import { canonicalFor } from "@/lib/seo";
import DomainsContent from "./_components/DomainsContent";

// Rendered per request so the nonce-based CSP (middleware.js) can stamp the
// inline bootstrap scripts. A prerendered page would ship unnonced scripts and
// the browser would block them.
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Choose Your Domain",
  description:
    "From artificial intelligence to design, from writing code to organizing events — every domain at LOOM offers a different way to explore, create, and contribute.",
  ...canonicalFor("/domains"),
  openGraph: {
    title: "Choose Your Domain · LOOM",
    description:
      "Explore technical and non-technical domains. Discover where your skills can grow.",
  },
};

export default function DomainsPage() {
  return <DomainsContent />;
}
