# Verify OTP

**Group:** Authentication

| | |
|---|---|
| **Endpoint** | `POST /api/app/auth/verify-otp` |
| **Method** | POST |
| **Authentication** | None (public) |

## Headers
```
Content-Type: application/json
```

## Request body
```json
{
  "sessionId": "a1b2c3d4e5f6",
  "otp": "1234"
}
```

## Validation rules
- `sessionId` from /login is required.
- `otp` must be a 4-digit numeric string.
- Session expires in 5 minutes / after 5 attempts.

## Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "tokenType": "Bearer",
    "expiresIn": 43200,
    "refreshExpiresIn": 2592000,
    "registrationCompleted": false,
    "currentStep": 1,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## Error responses
**400 INVALID_SESSION**
```json
{
  "success": false,
  "message": "Invalid or expired session.",
  "data": null,
  "errors": [
    {
      "code": "INVALID_SESSION",
      "message": "Invalid or expired session."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

**400 OTP_EXPIRED**
```json
{
  "success": false,
  "message": "OTP expired.",
  "data": null,
  "errors": [
    {
      "code": "OTP_EXPIRED",
      "message": "OTP expired."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

**400 INVALID_OTP**
```json
{
  "success": false,
  "message": "Enter any 4-digit code.",
  "data": null,
  "errors": [
    {
      "code": "INVALID_OTP",
      "message": "Enter any 4-digit code."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

**429 TOO_MANY_ATTEMPTS**
```json
{
  "success": false,
  "message": "Too many attempts.",
  "data": null,
  "errors": [
    {
      "code": "TOO_MANY_ATTEMPTS",
      "message": "Too many attempts."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## HTTP status codes
- `200 OK`
- `400`
- `429`

## cURL
```bash
curl -s -X POST http://localhost:5000/api/app/auth/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"a1b2c3d4e5f6","otp":"1234"}'
```

## Notes
- Store `accessToken` + `refreshToken` securely.
- `currentStep` tells the app which registration step to open.
