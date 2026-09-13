# API Contracts

## Envelope

All API route handlers return one of two shapes.

Success:

```json
{
  "ok": true,
  "data": {}
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body is invalid",
    "details": {}
  }
}
```

## Status Codes

- `200` for successful reads and idempotent writes
- `201` for creates
- `400` for validation errors
- `401` for missing auth
- `403` for authorization failures
- `404` for missing resources
- `409` for duplicate or conflicting writes
- `429` for rate limits
- `500` for unexpected server errors

## Initial Routes

Public:

- `GET /`

Student:

- `GET /student`
- `POST /api/roadmap/progress`

Admin:

- `GET /admin`

System:

- `GET /api/health`

GitHub:

- `POST /api/github/webhook`
- `POST /api/jobs/github/process`

## Pagination

List endpoints use cursor pagination:

```json
{
  "items": [],
  "nextCursor": null
}
```

## Caching

Immutable-ish data can be cached aggressively:

- Roadmaps
- Resources
- Contest rules
- Domain descriptions

Semi-dynamic data uses short TTLs:

- Leaderboards
- Event lists
- Domain statistics

Personal data is dynamic:

- Student progress
- Notifications
- Submission status
