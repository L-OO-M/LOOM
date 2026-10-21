import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// One implementation of the asset shelf: /lead/assets (admins pass its gate).
// This admin route was a second copy of the same component over the same data.
export default function AdminAssetsPage() {
  redirect("/lead/assets");
}
