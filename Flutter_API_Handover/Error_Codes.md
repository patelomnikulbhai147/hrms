# Error Codes Mapping

| Code | Meaning | Description |
|------|---------|-------------|
| 400 | Bad Request | Validation failed, missing parameters, or invalid OTP. |
| 401 | Unauthorized | Missing or invalid JWT. User must re-login. |
| 403 | Forbidden | User authenticated but lacks required role/permission. |
| 404 | Not Found | Requested resource (User, Employee, etc.) does not exist. |
| 409 | Conflict | Data conflict (e.g., duplicate email/mobile). |
| 422 | Unprocessable Entity | Semantically incorrect payload. |
| 429 | Too Many Requests | Rate limit exceeded (e.g., too many OTP requests). |
| 500 | Server Error | Unhandled backend exception. Show generic error to user. |
