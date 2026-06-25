# Get Profile (me)

| | |
|---|---|
| **Endpoint** | `GET /api/v1/auth/me` |
| **Method** | GET |
| **Authorization** | Bearer access token |

## Required headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

## Request body
_None._

## Validation rules
- Send a valid, unexpired access token in the Authorization header.

## Success response — 200 OK
```json
{
  "success": true,
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
**401 UNAUTHORIZED**
```json
{
  "success": false,
  "code": "UNAUTHORIZED",
  "message": "Not authorized, token failed"
}
```

**404 USER_NOT_FOUND**
```json
{
  "success": false,
  "code": "USER_NOT_FOUND",
  "message": "Account not found."
}
```

## HTTP status codes
- `200 OK`
- `401 Unauthorized`
- `404 Not Found`

## Example cURL
```bash
curl -s http://localhost:5000/api/v1/auth/me \
  -H 'Authorization: Bearer <accessToken>'
```

## Example Flutter (Dio)
```dart
Future<Map<String, dynamic>> getMe(String accessToken) async {
  final res = await dio.get('/api/v1/auth/me',
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}));
  return res.data['user'] as Map<String, dynamic>;
}
```

## Notes
- Call on app start (after reading a stored token) to hydrate the user state.
- Returns the same `user` shape as /verify-otp.
