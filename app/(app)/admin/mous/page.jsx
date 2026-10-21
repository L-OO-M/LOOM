import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// One implementation of the MoU board: /lead/mous (admins pass its gate).
export default function AdminMoUsPage() {
  redirect("/lead/mous");
}
