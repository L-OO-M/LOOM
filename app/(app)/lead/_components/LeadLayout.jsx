import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { getSql } from "@/lib/db";
import { getLeadOverview } from "@/lib/lead";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { LeadConsole } from "./LeadConsole";

/**
 * One server component renders every lead section.
 *
 * Section navigation is owned by the AppShell top nav (lib/nav.js `leadNav`),
 * which points at real routes. Previously the page also drew its own pill bar
 * over the same five sections while the top nav pointed at #roster / #workshops
 * anchors — two navigation systems for one screen. Routes fix that: each
 * section has a shareable URL, browser back works, and refresh keeps you put.
 */

export const LEAD_SECTIONS = {
  overview: {
    kicker: "Console",
    title: "Your vertical, at a glance.",
    desc: "Roster health, contribution output, real turnout, and the decisions waiting on you."
  },
  roster: {
    kicker: "Roster",
    title: "The roster.",
    desc: "Every member in your scope, their level, and the Core requests you can act on."
  },
  workshops: {
    kicker: "Workshops",
    title: "Workshops & turnout.",
    desc: "Seat fill for what is coming, and whether people actually showed up last time."
  },
  reports: {
    kicker: "Reports",
    title: "Calendar & reports.",
    desc: "Scheduling conflicts, the contribution ledger, and monthly department reports."
  },
  succession: {
    kicker: "Succession",
    title: "Succession.",
    desc: "Who is ready to carry a department forward when a tenure ends."
  }
};

export async function LeadSection({ section = "overview" }) {
  const meta = LEAD_SECTIONS[section] || LEAD_SECTIONS.overview;

  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=${encodeURIComponent(`/lead/${section}`)}`);
  const { user, profile, tenant } = ctx;
  if (!["dept_lead", "vertical_lead", "admin"].includes(profile.role)) redirect("/student");

  const sql = getSql();
  const data = await getLeadOverview(sql, { userId: user.id, profile, tenant });
  const isVertical = data.role === "vertical_lead" || data.role === "admin";

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <PageHeader
          kicker={`${meta.kicker} · ${isVertical ? "Vertical Lead" : "Department Lead"}`}
          title={meta.title}
          desc={meta.desc}
        />
        <LeadConsole initialData={data} userId={user.id} isVertical={isVertical} section={section} />
      </main>
    </AppShell>
  );
}