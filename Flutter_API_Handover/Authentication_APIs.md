==================================================
COMPANY HEAD / HR LOGIN
==================================================

Endpoint
POST /auth/login

Purpose
Login Company Head or HR.

Authentication
No

Headers
Content-Type: application/json

Request Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | String | Yes | User Email |
| password | String | Yes | User Password |

Sample Request
```json
{
  "email": "admin@company.com",
  "password": "Password@123"
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
  "otpSessionId": "sess_123456",
  "message": "OTP sent to email."
}
```

Error Responses
400
401
403
404
429
500

Sample Error JSON
```json
{
  "success": false,
  "error": "Invalid email or password."
}
```

==================================================
COMPANY HEAD / HR VERIFY OTP
==================================================

Endpoint
POST /auth/verify-otp

Purpose
Verify the Email OTP.

Authentication
No

Headers
Content-Type: application/json

Request Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| otpSessionId | String | Yes | Session ID from login |
| otp | String | Yes | 6-digit OTP |

Sample Request
```json
{
  "otpSessionId": "sess_123456",
  "otp": "123456"
}
```

Success Response
Status Code
200 OK

Response Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| success | Boolean | API Status |
| token | String | JWT Token |
| refreshToken | String | Refresh Token |
| user | Object | User Details |

Sample Response
```json
{
  "success": true,
  "token": "eyJhbG...",
  "refreshToken": "ref_...",
  "user": {
    "id": 1,
    "email": "admin@company.com",
    "role": "Company Head"
  }
}
```

Error Responses
400
401
500

Sample Error JSON
```json
{
  "success": false,
  "error": "Invalid or expired OTP."
}
```

==================================================
REFRESH TOKEN
==================================================

Endpoint
POST /auth/refresh

Purpose
Refresh JWT using Refresh Token.

Authentication
Yes

Headers
Authorization: Bearer <refresh_token>

Request Parameters
None

Sample Request
None

Success Response
Status Code
200 OK

Sample Response
```json
{
  "success": true,
  "token": "eyJhbG..."
}
```

Error Responses
401
500

==================================================
LOGOUT
==================================================

Endpoint
POST /auth/logout

Purpose
Logout the current device.

Authentication
Yes

Headers
Authorization: Bearer <jwt_token>

Request Parameters
None

Sample Request
None

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

Error Responses
401
500

==================================================
LOGOUT ALL
==================================================

Endpoint
POST /auth/logout-all

Purpose
Logout from all devices.

Authentication
Yes

Headers
Authorization: Bearer <jwt_token>

Request Parameters
None

Sample Request
None

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

Error Responses
401
500
