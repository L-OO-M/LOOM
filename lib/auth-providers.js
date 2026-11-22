/**
 * Which social sign-in buttons the auth pages offer.
 *
 * GitHub is currently HIDDEN on /login and /register. The code path, the Auth0
 * connection and the callback are all still here and still work -- only the
 * button is not rendered. Reason and re-enable steps:
 * docs/31-known-issues.md ("GitHub sign-in is hidden").
 *
 * Read by client components, so the value is inlined at build time. Set
 * NEXT_PUBLIC_GITHUB_SIGNIN=1 and rebuild to bring the button back; no other
 * change is required.
 */
const flag = process.env.NEXT_PUBLIC_GITHUB_SIGNIN;

export const GITHUB_SIGNIN_ENABLED = flag === "1" || flag === "true";
