import { redirect } from "next/navigation";
import { LeadSection } from "./_components/LeadLayout";

export const dynamic = "force-dynamic";

export default function LeadPage() {
  // /lead is the console entry point. The sections live at real routes so the
  // top nav owns navigation; /lead redirects to the first one rather than
  // rendering a duplicate of it.
  redirect("/lead/overview");
}