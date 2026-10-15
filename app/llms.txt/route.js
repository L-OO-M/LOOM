import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/seo";

export const dynamic = "force-static";
export const revalidate = 86400;

const BODY = `# ${SITE_NAME}
> ${SITE_TAGLINE} ${SITE_DESCRIPTION}

## Public pages
- ${absoluteUrl("/")} — Public landing page and chapter entry point.
- ${absoluteUrl("/about")} — What L.O.O.M. is and which departments currently lead it.
- ${absoluteUrl("/events")} — Upcoming and live chapter events.
- ${absoluteUrl("/domains")} — Active department catalog.
- ${absoluteUrl("/domains/[slug]")} — One active department, its roadmap nodes, and upcoming workshops.
- ${absoluteUrl("/faq")} — Published membership and participation answers.
- ${absoluteUrl("/privacy")} — Draft privacy disclosure; chapter review pending.
- ${absoluteUrl("/terms")} — Draft terms; chapter review pending.
- ${absoluteUrl("/contact")} — Responsible chapter contact; public contact details pending publication.
- ${absoluteUrl("/verify/credential/[id]")} — Public verification for one credential link.
- ${absoluteUrl("/u/[username]")} — Public builder card, only when the member makes it public.

## Public machine-readable endpoints
- ${absoluteUrl("/api/public/events")} — Upcoming/live events.
- ${absoluteUrl("/api/public/projects")} — Latest showcased projects.
- ${absoluteUrl("/api/public/departments")} — Active departments and member counts.
- ${absoluteUrl("/api/chapters")} — Public chapter directory.
- ${absoluteUrl("/sitemap.xml")} — Crawlable public URL inventory.
- ${absoluteUrl("/robots.txt")} — Crawler permissions.

## Access and tenancy model
- Public pages use signed-out-safe data or honest empty states.
- Student, lead, and admin areas require authentication and role checks.
- Tenant identity is resolved server-side and is never accepted from client input.
- Credential and profile links may be shared, but private records remain access-controlled.
`;

export async function GET() {
  return new Response(BODY, {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}
