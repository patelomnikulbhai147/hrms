# Approval Status

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `GET /api/app/profile/status` |
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
    "approvalStatus": "Pending Approval",
    "completionPercentage": 100
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
curl -s -X GET http://localhost:5000/api/app/profile/status \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

## Notes
- Values: Draft | Pending Approval | Approved | Rejected | Changes Requested.
- If Rejected / Changes Requested, a `remarks` field is included.
