import { POST as githubWebhook } from "@/app/api/github/webhook/route";

/**
 * Compatibility alias for the GitHub webhook at /api/webhook.
 *
 * The canonical endpoint is /api/github/webhook. This deployment's GitHub hook
 * was configured with /api/webhook, which did not exist — so the middleware
 * auth-gate caught it (it was not in publicPaths) and returned 401, and a
 * direct request to a non-existent route returns 404. GitHub surfaced that as
 * a failed delivery.
 *
 * This route re-exports the exact same handler so both URLs work, and
 * middleware lists /api/webhook as public alongside it. GitHub's signature check
 * still runs inside the delegated handler — this alias grants no access of its
 * own and stores nothing.
 *
 * Prefer /api/github/webhook in GitHub's settings; this exists so an existing
 * hook keeps working.
 */
export async function POST(request) {
  return githubWebhook(request);
}

// GitHub's UI pings with GET when you edit the URL. Answer honestly rather than
// letting it render as a 405, so a correct configuration is visible immediately.
export async function GET() {
  return Response.json(
    {
      ok: true,
      service: "L.O.O.M. GitHub webhook",
      canonical: "/api/github/webhook",
      accepts: "POST",
      note: "Deliveries are POSTed by GitHub with x-hub-signature-256."
    },
    { status: 200, headers: { "content-type": "application/json" } }
  );
}