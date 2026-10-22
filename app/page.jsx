import { JsonLd, organizationSchema, webSiteSchema } from "@/components/seo/JsonLd";
import { canonicalFor } from "@/lib/seo";
import StoryHome from "./_components/storyloom/StoryHome";

export const metadata = { ...canonicalFor("/") };

export default function LandingPage() {
  return <><JsonLd data={organizationSchema()} /><JsonLd data={webSiteSchema()} /><StoryHome /></>;
}
