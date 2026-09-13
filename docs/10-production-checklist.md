# Production Checklist

## Environment

- Configure control-plane database URL
- Configure tenant database routes
- Configure Supabase Auth or chosen Auth.js provider
- Configure GitHub App credentials
- Configure QStash token
- Configure Upstash Redis
- Configure R2 bucket credentials
- Configure Sentry DSN

## Security

- Confirm tenant resolution uses host/domain only
- Confirm every mutation checks RBAC
- Confirm GitHub signatures reject invalid payloads
- Confirm secrets do not appear in logs
- Confirm admin mutations write audit logs
- Confirm rate limits cover webhook, auth, and admin mutation routes

## Performance

- Confirm dashboards read aggregates
- Confirm GitHub reconciliation is scheduled and bounded
- Confirm static roadmap/resource data uses cache policy
- Confirm personal progress data stays dynamic
- Confirm load tests cover realistic route mixes

## Accessibility

- Confirm keyboard navigation across student and admin flows
- Confirm visible focus states
- Confirm reduced-motion behavior
- Confirm color contrast on buttons, forms, and status labels
