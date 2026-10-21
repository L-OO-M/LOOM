import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The leadership directory has one home: /lead/directory (leads, admins and
// above; admins already pass its role gate). This admin route used to be a
// near-identical second copy that nothing in the admin nav pointed at.
export default function AdminDirectoryPage() {
  redirect("/lead/directory");
}
