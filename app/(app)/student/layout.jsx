import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";

// Private workspace — never indexed.
export const metadata = {
  robots: { index: false, follow: false }
};

export default async function StudentLayout({ children }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/student");
  if (ctx.error === "PROFILE_NOT_FOUND") redirect("/login?redirect=/student");
  return <>{children}</>;
}
