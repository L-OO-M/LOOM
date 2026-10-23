"use client";

import { usePathname } from "next/navigation";
import { workspaceForPath } from "@/lib/nav";
import { PublicNav } from "./PublicNav";

/**
 * Owns the public header and the offset it needs. Workspace routes render
 * their own navigation (AppShell), so the marketing/header chrome must not
 * compete with it or reserve a 64px strip above it.
 */
export function SiteFrame({ children }) {
  const pathname = usePathname();
  const workspace = workspaceForPath(pathname);

  return (
    <>
      {!workspace && <PublicNav />}
      <div className={workspace ? "site-content is-workspace" : "site-content"}>
        {children}
      </div>
    </>
  );
}
