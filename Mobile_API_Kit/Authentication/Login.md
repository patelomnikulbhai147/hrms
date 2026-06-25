# Login — generate OTP session

| | |
|---|---|
| **Endpoint** | `POST /api/v1/auth/login` |
| **Method** | POST |
| **Authorization** | None (public) |

## Required headers
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
- Send exactly ONE identifier: `mobile`, `employeeId`, or `email`.
- The identifier must belong to an existing, active account.

## Success response — 200 OK
```json
{
  "success": true,
  "message": "OTP Generated",
  "otpRequired": true,
  "otpLength": 4,
  "sessionId": "a1b2c3d4e5f6",
  "expiresInMinutes": 5,
  "otpMode": "development",
  "devOtp": "1111",
  "devNote": "OTP_MODE=development — enter any 4-digit code to log in. No SMS is sent."
}
```

## Error responses
**400 IDENTIFIER_REQUIRED**
```json
{
  "success": false,
  "code": "IDENTIFIER_REQUIRED",
  "message": "Provide a mobile number, employee ID, or email."
}
```

**404 USER_NOT_FOUND**
```json
{
  "success": false,
  "code": "USER_NOT_FOUND",
  "message": "No account is registered for that identifier."
}
```

**403 ACCOUNT_INACTIVE**
```json
{
  "success": false,
  "code": "ACCOUNT_INACTIVE",
  "message": "Account inactive. Please contact your administrator."
}
```

**403 BRANCH_DISABLED**
```json
{
  "success": false,
  "code": "BRANCH_DISABLED",
  "message": "Branch disabled. Please contact your administrator."
}
```

## HTTP status codes
- `200 OK`
- `400 Bad Request`
- `403 Forbidden`
- `404 Not Found`
- `500 Server Error`

## Example cURL
```bash
curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"mobile":"9876543210"}'
```

## Example Flutter (Dio)
```dart
// Using package:dio
final dio = Dio(BaseOptions(baseUrl: 'http://localhost:5000'));

Future<String> login(String identifier) async {
  // Send whichever field applies: mobile / employeeId / email
  final res = await dio.post('/api/v1/auth/login', data: {'mobile': identifier});
  return res.data['sessionId'] as String; // navigate to OTP screen
}
```

## Notes
- In development the response includes `devOtp` and any 4-digit code will verify.
- Persist the returned `sessionId` and pass it to /verify-otp.
- The OTP screen must always be shown, even though dev mode accepts any code.
