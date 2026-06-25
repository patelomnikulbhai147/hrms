# Logout

| | |
|---|---|
| **Endpoint** | `POST /api/v1/auth/logout` |
| **Method** | POST |
| **Authorization** | Bearer access token |

## Required headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

## Request body
_None._

## Validation rules
- Send the current access token in the Authorization header.

## Success response — 200 OK
```json
{
  "success": true,
  "message": "Logged out."
}
```

## Error responses
**401 UNAUTHORIZED**
```json
{
  "success": false,
  "code": "UNAUTHORIZED",
  "message": "Not authorized, no token provided"
}
```

## HTTP status codes
- `200 OK`
- `401 Unauthorized`

## Example cURL
```bash
curl -s -X POST http://localhost:5000/api/v1/auth/logout \
  -H 'Authorization: Bearer <accessToken>'
```

## Example Flutter (Dio)
```dart
Future<void> logout(String accessToken) async {
  await dio.post('/api/v1/auth/logout',
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}));
  await storage.deleteAll();
}
```

## Notes
- Tokens are stateless JWTs — after calling logout, clear them from local storage.
- Any outstanding OTP sessions for the user are invalidated server-side.
