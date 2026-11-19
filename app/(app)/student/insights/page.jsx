import { redirect } from "next/navigation";

/* Deliberate alias, not a forgotten route. /student/insights was a standalone
   page before Growth moved onto the dashboard; old links and bookmarks still
   arrive here and must land on the section they meant. Nothing links to this
   path any more, so it shows up as a redirect in a sweep — that is expected. */
export const dynamic = "force-dynamic";

export default function InsightsPage() {
  redirect("/student#growth");
}
