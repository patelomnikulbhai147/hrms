# Attendance

**Group:** Dashboard

| | |
|---|---|
| **Endpoint** | `GET /api/app/attendance` |
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
    "summary": {
      "totalRecords": 22,
      "presentDays": 20
    },
    "records": [
      {
        "date": "2026-06-24",
        "status": "Present",
        "clockIn": "09:05",
        "clockOut": "18:10",
        "hoursWorked": 8.5
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
curl -s -X GET http://localhost:5000/api/app/attendance \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

## Notes
- Standard response envelope: { success, message, data, errors, timestamp }.
