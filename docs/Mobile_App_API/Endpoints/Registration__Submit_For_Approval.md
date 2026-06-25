# Submit For Approval

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/submit` |
| **Method** | POST |
| **Authentication** | Bearer access token |

## Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

## Request body
_None._

## Validation rules
- All mandatory fields + documents must be present.
- Cannot submit an already-approved profile.

## Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "approvalStatus": "Pending Approval",
    "submittedAt": "2026-06-25T12:00:00.000Z"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## Error responses
**422 VALIDATION_FAILED**
```json
{
  "success": false,
  "message": "Please complete all required fields and documents before submitting.",
  "data": null,
  "errors": [
    {
      "code": "VALIDATION_FAILED",
      "message": "Please complete all required fields and documents before submitting."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

**400 ALREADY_APPROVED**
```json
{
  "success": false,
  "message": "Your profile is already approved.",
  "data": null,
  "errors": [
    {
      "code": "ALREADY_APPROVED",
      "message": "Your profile is already approved."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## HTTP status codes
- `200 OK`
- `422`
- `400`

## cURL
```bash
curl -s -X POST http://localhost:5000/api/app/profile/submit \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

## Notes
- On success the record enters the HR website “Pending Approval” queue.
- 422 returns an `errors[]` array of missing fields/documents.
