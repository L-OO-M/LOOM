import { getSessionIdentity } from "@/lib/auth-server";
import { ok } from "@/lib/api";

// Lightweight "am I signed in, and as whom" probe for CLIENT components.
//
// The landing page and any client chrome need the session state, but the
// session cookie is httpOnly and may be an Auth0 cookie the browser cannot read.
// This returns just the identity (never a profile, never a tenant), from either
// front door, and is deliberately PUBLIC so a logged-out visitor gets
// `signedIn: false` with a 200 instead of the middleware's 401.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const identity = await getSessionIdentity();
    return ok({ signedIn: !!identity?.userId, email: identity?.email ?? null });
  } catch {
    return ok({ signedIn: false, email: null });
  }
}
