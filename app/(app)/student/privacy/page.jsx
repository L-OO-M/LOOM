import { redirect } from "next/navigation";

/* Deliberate alias. Privacy controls live inside Settings; this path existed as
   its own page and is kept for old links and bookmarks. Nothing links to it
   today, so a sweep reporting a redirect here is expected, not a broken page. */
export default function PrivacyPage() {
  redirect("/student/settings#privacy");
}
