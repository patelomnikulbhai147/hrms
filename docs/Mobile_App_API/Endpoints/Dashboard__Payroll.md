# Payroll

**Group:** Dashboard

| | |
|---|---|
| **Endpoint** | `GET /api/app/payroll` |
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
    "payslips": [
      {
        "id": 5,
        "month": "June",
        "year": 2026,
        "basicSalary": 21000,
        "allowances": 15000,
        "deductions": 4000,
        "netSalary": 42000,
        "paymentStatus": "pending",
        "payslipGenerated": false
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
curl -s -X GET http://localhost:5000/api/app/payroll \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

## Notes
- Standard response envelope: { success, message, data, errors, timestamp }.
