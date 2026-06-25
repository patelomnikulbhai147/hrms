# Error Codes

Every error uses the envelope:

```json
{ "success": false, "message": "...", "data": null, "errors": [{ "code": "...", "message": "..." }], "timestamp": "..." }
```

| HTTP | Code | Message |
|------|------|---------|
| 400 | `MOBILE_REQUIRED` | Mobile number is required. |
| 400 | `INVALID_SESSION` | Invalid or expired session. |
| 400 | `OTP_EXPIRED` | OTP expired. |
| 400 | `INVALID_OTP` | Enter any 4-digit code. |
| 400 | `REFRESH_TOKEN_REQUIRED` | A refresh token is required. |
| 400 | `ALREADY_APPROVED` | Your profile is already approved. |
| 400 | `TYPE_REQUIRED` | Document type is required. |
| 400 | `CONTENT_REQUIRED` | Document content is required. |
| 401 | `REFRESH_TOKEN_INVALID` | Session expired. Please log in again. |
| 401 | `NO_TOKEN` | Not authorized — no token provided. |
| 401 | `TOKEN_INVALID` | Session expired. |
| 403 | `NOT_APPROVED` | Dashboard is available only after HR approval. |
| 404 | `EMPLOYEE_NOT_FOUND` | Employee not found. |
| 422 | `VALIDATION_FAILED` | leaveType, fromDate and toDate are required. |
| 429 | `TOO_MANY_ATTEMPTS` | Too many attempts. |
