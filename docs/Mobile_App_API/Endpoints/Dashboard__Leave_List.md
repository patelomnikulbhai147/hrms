# Leave List

**Group:** Dashboard

| | |
|---|---|
| **Endpoint** | `GET /api/app/leave` |
| **Method** | GET |
| **Authentication** | Bearer access token (approved employees only) |

## Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

## Request body
_None._

## Validation rules
- Available only after HR approval.

## Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "requests": [
      {
        "id": 12,
        "leaveType": "Casual",
        "fromDate": "2026-06-20",
        "toDate": "2026-06-21",
        "days": 2,
        "reason": "Personal",
        "status": "Pending",
        "appliedOn": "2026-06-18"
      }
    ]
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## Error responses
**403 NOT_APPROVED**
```json
{
  "success": false,
  "message": "Dashboard is available only after HR approval.",
  "data": null,
  "errors": [
    {
      "code": "NOT_APPROVED",
      "message": "Dashboard is available only after HR approval."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## HTTP status codes
- `200 OK`
- `403`

## cURL
```bash
curl -s -X GET http://localhost:5000/api/app/leave \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

## Notes
- Standard response envelope: { success, message, data, errors, timestamp }.
