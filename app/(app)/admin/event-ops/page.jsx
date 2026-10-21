import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// One implementation of event ops: /lead/event-ops (admins pass its gate).
// This route carried a verbatim copy of the lead page's inline SQL.
export default function AdminEventOpsPage() {
  redirect("/lead/event-ops");
}
