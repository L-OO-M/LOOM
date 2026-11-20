// One line under the sign-in buttons.
//
// Auth0 signs people in on its own origin, so the URL changes to
// lets-loom.jp.auth0.com for a few seconds. The hop itself is fine -- it is two
// redirects and well under a second -- but an unexplained domain change is the
// single biggest "is this phishing?" jolt in the flow. Saying it up front turns
// a surprise into an expected step.
//
// Deliberately does NOT print the tenant host: when the custom domain lands
// (docs/24-auth0-migration.md) the copy would be stale, and a half-styled page
// saying "lets-loom.jp.auth0.com" is worse than one that says nothing.
export default function AuthHandoffNote({ className = "mt-2" }) {
  return (
    <p className={`text-xs leading-5 ${className}`} style={{ color: "var(--text-muted)" }}>
      Sign-in continues on our secure Auth0 page, then you come straight back.
    </p>
  );
}
