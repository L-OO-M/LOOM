import { PublicFooter } from "@/components/landing/PublicFooter";
import { JsonLd, aboutPageSchema } from "@/components/seo/JsonLd";
import { SITE_DESCRIPTION, canonicalFor } from "@/lib/seo";
import AboutStory from "./_components/AboutStory";

export const dynamic = "force-static";

export const metadata = {
  title: "About",
  description:
    "What LOOM is: a beginner-first developer loop — learn, practice, build, collaborate, mentor — run by student departments, measured on accessibility, readiness, excellence, and network.",
  ...canonicalFor("/about"),
  openGraph: {
    title: "About | LOOM",
    description: SITE_DESCRIPTION,
  },
};

export default function AboutPage() {
  return (
    <main id="main" className="w-full max-w-full overflow-x-clip">
      <JsonLd data={aboutPageSchema()} />
      <div >
        <AboutStory />
      </div>
      <PublicFooter />
    </main>
  );
}
