import { canonicalFor } from "@/lib/seo";
import DomainsContent from "./_components/DomainsContent";

export const dynamic = "force-static";
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
