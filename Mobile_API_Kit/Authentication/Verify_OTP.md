# Verify OTP — issue tokens

| | |
|---|---|
| **Endpoint** | `POST /api/v1/auth/verify-otp` |
| **Method** | POST |
| **Authorization** | None (public) |

## Required headers
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
- `sessionId` must be the value returned by /login.
- `otp` must be a numeric string of length `otpLength` (default 4).
- A session expires after ~5 minutes and after 5 failed attempts.

## Success response — 200 OK
```json
{
  "success": true,
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "refreshExpiresIn": 2592000,
  "user": {
    "id": 1,
    "userId": 1,
    "employeeRecordId": 12,
    "employeeId": "VE-AHM-001",
    "employeeCode": "VE-AHM-001",
    "firstName": "Om",
    "lastName": "Patel",
    "name": "Om Patel",
    "email": "abc@gmail.com",
    "mobile": "9876543210",
    "company": {
      "id": 2,
      "name": "Vision Enterprise"
    },
    "branch": {
      "id": 5,
      "name": "Ahmedabad"
    },
    "department": "IT",
    "designation": "Developer",
    "role": "Employee",
    "permissions": [
      "attendance.view",
      "attendance.mark",
      "leave.create"
    ],
    "permissionMatrix": {
      "attendance": {
        "view": true,
        "mark": true
      },
      "leave": {
        "create": true
      }
    },
    "moduleAccess": {
      "attendance": true,
      "leave": true
    },
    "profileImage": "",
    "themePreference": null,
    "languagePreference": null,
    "isFirstLogin": false,
    "isPasswordCreated": true
  }
}
```

## Error responses
**400 INVALID_SESSION**
```json
{
  "success": false,
  "code": "INVALID_SESSION",
  "message": "Invalid or unknown session."
}
```

**400 SESSION_CONSUMED**
```json
{
  "success": false,
  "code": "SESSION_CONSUMED",
  "message": "This OTP session was already used. Please request a new code."
}
```

**400 OTP_EXPIRED**
```json
{
  "success": false,
  "code": "OTP_EXPIRED",
  "message": "Your code has expired. Please request a new one."
}
```

**400 INVALID_OTP**
```json
{
  "success": false,
  "code": "INVALID_OTP",
  "message": "Enter any 4-digit code."
}
```

**429 TOO_MANY_ATTEMPTS**
```json
{
  "success": false,
  "code": "TOO_MANY_ATTEMPTS",
  "message": "Too many incorrect attempts. Please request a new code."
}
```

## HTTP status codes
- `200 OK`
- `400 Bad Request`
- `429 Too Many Requests`
- `500 Server Error`

## Example cURL
```bash
curl -s -X POST http://localhost:5000/api/v1/auth/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"a1b2c3d4e5f6","otp":"1234"}'
```

## Example Flutter (Dio)
```dart
Future<void> verifyOtp(String sessionId, String otp) async {
  final res = await dio.post('/api/v1/auth/verify-otp',
      data: {'sessionId': sessionId, 'otp': otp});
  final data = res.data;
  await storage.write(key: 'accessToken', value: data['accessToken']);
  await storage.write(key: 'refreshToken', value: data['refreshToken']);
  // data['user'] holds the full profile
}
```

## Notes
- Store `accessToken` and `refreshToken` securely (flutter_secure_storage).
- The `user` object is the full profile — see Models/User_Model.json.
- `expiresIn` is in seconds; refresh before it elapses or on a 401.
