import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";

export default async function AdminLayout({ children }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error === "PROFILE_NOT_FOUND") redirect("/login?redirect=/admin");
  return <>{children}</>;
}
