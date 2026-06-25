# Session

**Group:** Authentication

| | |
|---|---|
| **Endpoint** | `GET /api/app/auth/session` |
| **Method** | GET |
| **Authentication** | Bearer access token |

## Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

## Request body
_None._

## Validation rules
- Valid access token required.

## Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "loggedIn": true,
    "registrationCompleted": false,
    "currentStep": 4,
    "completionPercentage": 62,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## Error responses
**401 TOKEN_INVALID**
```json
{
  "success": false,
  "message": "Session expired. Please log in again.",
  "data": null,
  "errors": [
    {
      "code": "TOKEN_INVALID",
      "message": "Session expired. Please log in again."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## HTTP status codes
- `200 OK`
- `401`

## cURL
```bash
curl -s -X GET http://localhost:5000/api/app/auth/session \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

## Notes
- Call on splash to decide navigation: not logged in / resume registration / pending approval / dashboard.
