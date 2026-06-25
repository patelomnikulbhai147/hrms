# Login

**Group:** Authentication

| | |
|---|---|
| **Endpoint** | `POST /api/app/auth/login` |
| **Method** | POST |
| **Authentication** | None (public) |

## Headers
```
Content-Type: application/json
```

## Request body
```json
{
  "mobile": "9876543210"
}
```

## Validation rules
- `mobile` is required.
- Mobile must be linked to an existing Temporary Employee ID.

## Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "sessionId": "a1b2c3d4e5f6",
    "otpRequired": true,
    "otpLength": 4,
    "expiresIn": 300,
    "otpMode": "development",
    "devOtp": "1111"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## Error responses
**400 MOBILE_REQUIRED**
```json
{
  "success": false,
  "message": "Mobile number is required.",
  "data": null,
  "errors": [
    {
      "code": "MOBILE_REQUIRED",
      "message": "Mobile number is required."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

**404 EMPLOYEE_NOT_FOUND**
```json
{
  "success": false,
  "message": "Employee not found.",
  "data": null,
  "errors": [
    {
      "code": "EMPLOYEE_NOT_FOUND",
      "message": "Employee not found."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## HTTP status codes
- `200 OK`
- `400`
- `404`

## cURL
```bash
curl -s -X POST http://localhost:5000/api/app/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"mobile":"9876543210"}'
```

## Notes
- Development mode returns `devOtp` and accepts any 4-digit code. No SMS is sent.
- Navigate to the OTP screen with the returned `sessionId`.
