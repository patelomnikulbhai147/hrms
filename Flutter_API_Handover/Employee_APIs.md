==================================================
EMPLOYEE LOGIN
==================================================

Endpoint
POST /employee/login

Purpose
Login Employee via Mobile Number.

Authentication
No

Headers
Content-Type: application/json

Request Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| mobile | String | Yes | Employee Mobile Number |

Sample Request
```json
{
  "mobile": "9876543210"
}
```

Success Response
Status Code
200 OK

Response Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| success | Boolean | API Status |
| otpRequired | Boolean | OTP Required |
| otpSessionId | String | OTP Session |
| message | String | Response Message |

Sample Response
```json
{
  "success": true,
  "otpRequired": true,
  "otpSessionId": "sess_mob_123",
  "message": "OTP sent via SMS."
}
```

Error Responses
400
404
429
500

Sample Error JSON
```json
{
  "success": false,
  "error": "Employee not found."
}
```

==================================================
EMPLOYEE VERIFY OTP
==================================================

Endpoint
POST /employee/verify-otp

Purpose
Verify Employee SMS OTP.

Authentication
No

Headers
Content-Type: application/json

Request Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| otpSessionId | String | Yes | OTP Session |
| otp | String | Yes | 6-digit OTP |

Sample Request
```json
{
  "otpSessionId": "sess_mob_123",
  "otp": "123456"
}
```

Success Response
Status Code
200 OK

Sample Response
```json
{
  "success": true,
  "token": "eyJhbG...",
  "user": {
    "id": 12,
    "name": "John Doe",
    "mobile": "9876543210"
  }
}
```

Error Responses
400
500

==================================================
EMPLOYEE LOGOUT
==================================================

Endpoint
POST /employee/logout

Purpose
Logout the current device.

Authentication
Yes

Headers
Authorization: Bearer <jwt_token>

Success Response
Status Code
200 OK

Sample Response
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

==================================================
EMPLOYEE LOGOUT ALL
==================================================

Endpoint
POST /employee/logout-all

Purpose
Logout from all devices.

Authentication
Yes

Headers
Authorization: Bearer <jwt_token>

Success Response
Status Code
200 OK

Sample Response
```json
{
  "success": true,
  "message": "Logged out from all devices successfully"
}
```
