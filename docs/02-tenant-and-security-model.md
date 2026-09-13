# Tenant and Security Model

## Tenant Resolution

The browser never supplies trusted tenant identity. The server resolves tenant context from the request host or mapped domain.

Resolution order:

1. Read host from request headers
2. Normalize local development hosts
3. Look up matching tenant domain in the control plane
4. Load tenant database routing and feature flags
5. Attach tenant context to data access helpers

Local development uses `DEV_TENANT_SLUG` and `DEV_TENANT_DOMAIN`.

## Authorization

Every authenticated user has a platform identity and one or more tenant roles.

Initial roles:

- `student`
- `mentor`
- `admin`
- `platform_admin`

Every mutation checks:

- Authenticated user
- Tenant membership
- Required role
- Feature flag when the module is optional

## API Security

Route handlers must:

- Validate input with Zod
- Return the standard API envelope
- Resolve tenant server-side
- Authorize before mutation
- Rate limit risky endpoints
- Write audit logs for admin mutations

## GitHub Security

GitHub webhooks must:

- Verify `x-hub-signature-256`
- Reject unsigned or mismatched requests
- Normalize events before storage
- Enqueue background work instead of doing heavy processing inline
- Use idempotency keys based on GitHub delivery IDs

## Audit Logs

Every admin mutation writes:

- Actor ID
- Tenant ID
- Action
- Resource type
- Resource ID
- Before value
- After value
- Request metadata
- Timestamp

Audit logs are append-only in normal app flows.

## Secrets

Secrets live only in environment variables or managed secret stores. They must not appear in code, docs examples beyond placeholders, test snapshots, logs, or exported artifacts.
