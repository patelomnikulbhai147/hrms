# Get Me

**Group:** Authentication

| | |
|---|---|
| **Endpoint** | `GET /api/app/auth/me` |
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
    "tempEmployeeId": "VE-TEMP-000002",
    "name": "Om Patel",
    "mobile": "9876543210",
    "email": "om@example.com",
    "branch": "Ahmedabad",
    "approvalStatus": "Draft",
    "registrationCompleted": false,
    "currentStep": 4,
    "completionPercentage": 62,
    "employeeId": null,
    "isApproved": false
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
  "message": "Session expired.",
  "data": null,
  "errors": [
    {
      "code": "TOKEN_INVALID",
      "message": "Session expired."
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
curl -s -X GET http://localhost:5000/api/app/auth/me \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

## Notes
- Returns the onboarding identity; after approval `employeeId` is populated.
