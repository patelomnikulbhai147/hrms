# Apply Leave

**Group:** Dashboard

| | |
|---|---|
| **Endpoint** | `POST /api/app/leave/apply` |
| **Method** | POST |
| **Authentication** | Bearer access token (approved employees only) |

## Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

## Request body
```json
{
  "leaveType": "Casual",
  "fromDate": "2026-07-01",
  "toDate": "2026-07-02",
  "days": 2,
  "reason": "Family function"
}
```

## Validation rules
- `leaveType`, `fromDate`, `toDate` are required.

## Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": 31,
    "status": "Pending"
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
  "message": "leaveType, fromDate and toDate are required.",
  "data": null,
  "errors": [
    {
      "code": "VALIDATION_FAILED",
      "message": "leaveType, fromDate and toDate are required."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

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
- `422`
- `403`

## cURL
```bash
curl -s -X POST http://localhost:5000/api/app/leave/apply \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"leaveType":"Casual","fromDate":"2026-07-01","toDate":"2026-07-02","days":2,"reason":"Family function"}'
```

## Notes
- Standard response envelope: { success, message, data, errors, timestamp }.
