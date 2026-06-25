# Refresh Token

**Group:** Authentication

| | |
|---|---|
| **Endpoint** | `POST /api/app/auth/refresh` |
| **Method** | POST |
| **Authentication** | None (public) |

## Headers
```
Content-Type: application/json
```

## Request body
```json
{
  "refreshToken": "eyJhbGciOi..."
}
```

## Validation rules
- `refreshToken` must be valid and unexpired.

## Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "tokenType": "Bearer",
    "expiresIn": 43200
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## Error responses
**400 REFRESH_TOKEN_REQUIRED**
```json
{
  "success": false,
  "message": "A refresh token is required.",
  "data": null,
  "errors": [
    {
      "code": "REFRESH_TOKEN_REQUIRED",
      "message": "A refresh token is required."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

**401 REFRESH_TOKEN_INVALID**
```json
{
  "success": false,
  "message": "Session expired. Please log in again.",
  "data": null,
  "errors": [
    {
      "code": "REFRESH_TOKEN_INVALID",
      "message": "Session expired. Please log in again."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## HTTP status codes
- `200 OK`
- `400`
- `401`

## cURL
```bash
curl -s -X POST http://localhost:5000/api/app/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"eyJhbGciOi..."}'
```

## Notes
- Call inside a 401 interceptor, then retry the original request.
