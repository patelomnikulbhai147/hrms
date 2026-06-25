# Update Profile

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `PUT /api/app/profile/update` |
| **Method** | PUT |
| **Authentication** | Bearer access token |

## Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

## Request body
```json
{
  "email": "new@example.com",
  "presentAddress": "12 MG Road, Ahmedabad"
}
```

## Validation rules
- Before approval edits the draft; after approval edits limited Employee fields.

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
curl -s -X PUT http://localhost:5000/api/app/profile/update \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"email":"new@example.com","presentAddress":"12 MG Road, Ahmedabad"}'
```

## Notes
- Standard response envelope: { success, message, data, errors, timestamp }.
