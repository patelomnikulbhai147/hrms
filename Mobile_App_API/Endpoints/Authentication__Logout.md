# Logout

**Group:** Authentication

| | |
|---|---|
| **Endpoint** | `POST /api/app/auth/logout` |
| **Method** | POST |
| **Authentication** | Bearer access token |

## Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

## Request body
_None._

## Validation rules
- Send the access token in the Authorization header.

## Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {},
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## Error responses
**401 NO_TOKEN**
```json
{
  "success": false,
  "message": "Not authorized — no token provided.",
  "data": null,
  "errors": [
    {
      "code": "NO_TOKEN",
      "message": "Not authorized — no token provided."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## HTTP status codes
- `200 OK`
- `401`

## cURL
```bash
curl -s -X POST http://localhost:5000/api/app/auth/logout \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

## Notes
- Tokens are stateless — clear them from secure storage after calling.
