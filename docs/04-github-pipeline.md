# GitHub Pipeline

## Principle

GitHub integration is webhook-first. Polling is reserved for scheduled reconciliation.

## Flow

```text
GitHub App
webhook endpoint
signature verification
event normalization
QStash enqueue
processor job
raw event insert
aggregate updates
classification dirty marker
dashboard read
```

## Webhook Endpoint

`POST /api/github/webhook` verifies the request and returns quickly. It should not calculate leaderboards, update many profiles, or call external APIs beyond required validation.

Supported event families:

- `push`
- `pull_request`
- `pull_request_review`
- `issues`
- `repository`

## Processor Job

`POST /api/jobs/github/process` consumes normalized events. It is idempotent by delivery ID and event type.

The job writes:

- `github_events`
- `student_daily_activity`
- `repository_stats`
- `domain_activity`
- Dirty classification markers

## Reconciliation

A scheduled job may call GitHub GraphQL or REST APIs to repair missed events. This job is bounded, rate-limit aware, and never becomes the primary source of day-to-day activity.

## Retention

Raw event retention should be limited by policy. Aggregates stay longer because dashboards and analytics depend on them.

## Failure Handling

Failures should:

- Return a standard error envelope
- Preserve idempotency
- Retry through QStash where safe
- Write job status for admin review
- Avoid duplicate aggregate increments
