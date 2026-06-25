# Progress

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `GET /api/app/profile/progress` |
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
    "currentStep": 5,
    "completedSteps": [
      1,
      2,
      3,
      4
    ],
    "completionPercentage": 71,
    "totalSteps": 7,
    "canSubmit": false,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## Error responses
_Standard envelope with `success:false`._

## HTTP status codes
- `200 OK`

## cURL
```bash
curl -s -X GET http://localhost:5000/api/app/profile/progress \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

## Notes
- Drives the registration stepper UI and the “Send For Approval” button state.
