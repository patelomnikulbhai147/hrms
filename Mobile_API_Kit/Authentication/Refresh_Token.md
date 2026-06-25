# Refresh — new access token

| | |
|---|---|
| **Endpoint** | `POST /api/v1/auth/refresh` |
| **Method** | POST |
| **Authorization** | None (refresh token in body) |

## Required headers
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
- `refreshToken` must be the unexpired token from /verify-otp.

## Success response — 200 OK
```json
{
  "success": true,
  "accessToken": "eyJhbGciOi...",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
```

## Error responses
**400 REFRESH_TOKEN_REQUIRED**
```json
{
  "success": false,
  "code": "REFRESH_TOKEN_REQUIRED",
  "message": "A refresh token is required."
}
```

**401 REFRESH_TOKEN_INVALID**
```json
{
  "success": false,
  "code": "REFRESH_TOKEN_INVALID",
  "message": "Your session has expired. Please sign in again."
}
```

**403 ACCOUNT_INACTIVE**
```json
{
  "success": false,
  "code": "ACCOUNT_INACTIVE",
  "message": "Account inactive."
}
```

## HTTP status codes
- `200 OK`
- `400 Bad Request`
- `401 Unauthorized`
- `403 Forbidden`

## Example cURL
```bash
curl -s -X POST http://localhost:5000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"eyJhbGciOi..."}'
```

## Example Flutter (Dio)
```dart
Future<String> refresh(String refreshToken) async {
  final res = await dio.post('/api/v1/auth/refresh',
      data: {'refreshToken': refreshToken});
  final newAccess = res.data['accessToken'] as String;
  await storage.write(key: 'accessToken', value: newAccess);
  return newAccess;
}
```

## Notes
- Call this transparently inside a Dio interceptor on 401, then retry the request.
- If refresh returns 401, route the user back to the Login screen.
