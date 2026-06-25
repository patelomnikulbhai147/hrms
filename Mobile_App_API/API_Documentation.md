# HRMS Mobile App API — Complete Documentation (v1)

**Base URL (dev):** `http://localhost:5000` · **App base path:** `/api/app` · **Auth:** OTP (mobile linked to Temporary Employee).

Every response uses the envelope: `{ success, message, data, errors, timestamp }`.

> **Development OTP:** the app always shows the OTP screen; the backend accepts **any 4-digit OTP** and sends **no SMS** (`OTP_MODE=development`). Switching to production needs no app changes.

# Endpoint List — HRMS Mobile App API (`/api/app`)

| Group | Method | Endpoint | Auth |
|-------|--------|----------|------|
| Authentication | POST | `/api/app/auth/login` | None (public) |
| Authentication | POST | `/api/app/auth/verify-otp` | None (public) |
| Authentication | POST | `/api/app/auth/refresh` | None (public) |
| Authentication | POST | `/api/app/auth/logout` | Bearer access token |
| Authentication | GET | `/api/app/auth/session` | Bearer access token |
| Authentication | GET | `/api/app/auth/me` | Bearer access token |
| Registration | POST | `/api/app/profile/personal` | Bearer access token |
| Registration | POST | `/api/app/profile/address` | Bearer access token |
| Registration | POST | `/api/app/profile/family` | Bearer access token |
| Registration | POST | `/api/app/profile/bank` | Bearer access token |
| Registration | POST | `/api/app/profile/education` | Bearer access token |
| Registration | POST | `/api/app/profile/experience` | Bearer access token |
| Registration | POST | `/api/app/profile/documents` | Bearer access token |
| Registration | POST | `/api/app/profile/document` | Bearer access token |
| Registration | GET | `/api/app/profile/progress` | Bearer access token |
| Registration | POST | `/api/app/profile/submit` | Bearer access token |
| Registration | GET | `/api/app/profile/status` | Bearer access token |
| Registration | PUT | `/api/app/profile/update` | Bearer access token |
| Dashboard | GET | `/api/app/dashboard` | Bearer access token (approved employees only) |
| Dashboard | GET | `/api/app/profile` | Bearer access token (approved employees only) |
| Dashboard | GET | `/api/app/profile/documents` | Bearer access token (approved employees only) |
| Dashboard | GET | `/api/app/attendance` | Bearer access token (approved employees only) |
| Dashboard | GET | `/api/app/leave` | Bearer access token (approved employees only) |
| Dashboard | POST | `/api/app/leave/apply` | Bearer access token (approved employees only) |
| Dashboard | GET | `/api/app/payroll` | Bearer access token (approved employees only) |
| Dashboard | GET | `/api/app/notifications` | Bearer access token (approved employees only) |
| Dashboard | GET | `/api/app/holiday` | Bearer access token (approved employees only) |

---


# Authentication

## Login

**Group:** Authentication

| | |
|---|---|
| **Endpoint** | `POST /api/app/auth/login` |
| **Method** | POST |
| **Authentication** | None (public) |

### Headers
```
Content-Type: application/json
```

### Request body
```json
{
  "mobile": "9876543210"
}
```

### Validation rules
- `mobile` is required.
- Mobile must be linked to an existing Temporary Employee ID.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "sessionId": "a1b2c3d4e5f6",
    "otpRequired": true,
    "otpLength": 4,
    "expiresIn": 300,
    "otpMode": "development",
    "devOtp": "1111"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**400 MOBILE_REQUIRED**
```json
{
  "success": false,
  "message": "Mobile number is required.",
  "data": null,
  "errors": [
    {
      "code": "MOBILE_REQUIRED",
      "message": "Mobile number is required."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

**404 EMPLOYEE_NOT_FOUND**
```json
{
  "success": false,
  "message": "Employee not found.",
  "data": null,
  "errors": [
    {
      "code": "EMPLOYEE_NOT_FOUND",
      "message": "Employee not found."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `400`
- `404`

### cURL
```bash
curl -s -X POST http://localhost:5000/api/app/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"mobile":"9876543210"}'
```

### Notes
- Development mode returns `devOtp` and accepts any 4-digit code. No SMS is sent.
- Navigate to the OTP screen with the returned `sessionId`.


---

## Verify OTP

**Group:** Authentication

| | |
|---|---|
| **Endpoint** | `POST /api/app/auth/verify-otp` |
| **Method** | POST |
| **Authentication** | None (public) |

### Headers
```
Content-Type: application/json
```

### Request body
```json
{
  "sessionId": "a1b2c3d4e5f6",
  "otp": "1234"
}
```

### Validation rules
- `sessionId` from /login is required.
- `otp` must be a 4-digit numeric string.
- Session expires in 5 minutes / after 5 attempts.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "tokenType": "Bearer",
    "expiresIn": 43200,
    "refreshExpiresIn": 2592000,
    "registrationCompleted": false,
    "currentStep": 1,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**400 INVALID_SESSION**
```json
{
  "success": false,
  "message": "Invalid or expired session.",
  "data": null,
  "errors": [
    {
      "code": "INVALID_SESSION",
      "message": "Invalid or expired session."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

**400 OTP_EXPIRED**
```json
{
  "success": false,
  "message": "OTP expired.",
  "data": null,
  "errors": [
    {
      "code": "OTP_EXPIRED",
      "message": "OTP expired."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

**400 INVALID_OTP**
```json
{
  "success": false,
  "message": "Enter any 4-digit code.",
  "data": null,
  "errors": [
    {
      "code": "INVALID_OTP",
      "message": "Enter any 4-digit code."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

**429 TOO_MANY_ATTEMPTS**
```json
{
  "success": false,
  "message": "Too many attempts.",
  "data": null,
  "errors": [
    {
      "code": "TOO_MANY_ATTEMPTS",
      "message": "Too many attempts."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `400`
- `429`

### cURL
```bash
curl -s -X POST http://localhost:5000/api/app/auth/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"a1b2c3d4e5f6","otp":"1234"}'
```

### Notes
- Store `accessToken` + `refreshToken` securely.
- `currentStep` tells the app which registration step to open.


---

## Refresh Token

**Group:** Authentication

| | |
|---|---|
| **Endpoint** | `POST /api/app/auth/refresh` |
| **Method** | POST |
| **Authentication** | None (public) |

### Headers
```
Content-Type: application/json
```

### Request body
```json
{
  "refreshToken": "eyJhbGciOi..."
}
```

### Validation rules
- `refreshToken` must be valid and unexpired.

### Success response (200)
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

### Error responses
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

### HTTP status codes
- `200 OK`
- `400`
- `401`

### cURL
```bash
curl -s -X POST http://localhost:5000/api/app/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"eyJhbGciOi..."}'
```

### Notes
- Call inside a 401 interceptor, then retry the original request.


---

## Logout

**Group:** Authentication

| | |
|---|---|
| **Endpoint** | `POST /api/app/auth/logout` |
| **Method** | POST |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
_None._

### Validation rules
- Send the access token in the Authorization header.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {},
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
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

### HTTP status codes
- `200 OK`
- `401`

### cURL
```bash
curl -s -X POST http://localhost:5000/api/app/auth/logout \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

### Notes
- Tokens are stateless — clear them from secure storage after calling.


---

## Session

**Group:** Authentication

| | |
|---|---|
| **Endpoint** | `GET /api/app/auth/session` |
| **Method** | GET |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
_None._

### Validation rules
- Valid access token required.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "loggedIn": true,
    "registrationCompleted": false,
    "currentStep": 4,
    "completionPercentage": 62,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**401 TOKEN_INVALID**
```json
{
  "success": false,
  "message": "Session expired. Please log in again.",
  "data": null,
  "errors": [
    {
      "code": "TOKEN_INVALID",
      "message": "Session expired. Please log in again."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `401`

### cURL
```bash
curl -s -X GET http://localhost:5000/api/app/auth/session \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

### Notes
- Call on splash to decide navigation: not logged in / resume registration / pending approval / dashboard.


---

## Get Me

**Group:** Authentication

| | |
|---|---|
| **Endpoint** | `GET /api/app/auth/me` |
| **Method** | GET |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
_None._

### Validation rules
- Valid access token required.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "tempEmployeeId": "VE-TEMP-000002",
    "name": "Om Patel",
    "mobile": "9876543210",
    "email": "om@example.com",
    "branch": "Ahmedabad",
    "approvalStatus": "Draft",
    "registrationCompleted": false,
    "currentStep": 4,
    "completionPercentage": 62,
    "employeeId": null,
    "isApproved": false
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**401 TOKEN_INVALID**
```json
{
  "success": false,
  "message": "Session expired.",
  "data": null,
  "errors": [
    {
      "code": "TOKEN_INVALID",
      "message": "Session expired."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `401`

### cURL
```bash
curl -s -X GET http://localhost:5000/api/app/auth/me \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

### Notes
- Returns the onboarding identity; after approval `employeeId` is populated.


---


# Registration

## Save Personal

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/personal` |
| **Method** | POST |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
```json
{
  "firstName": "Om",
  "middleName": "",
  "lastName": "Patel",
  "dob": "1998-05-10",
  "gender": "Male",
  "maritalStatus": "Single",
  "nationality": "Indian",
  "bloodGroup": "O+",
  "email": "om@example.com"
}
```

### Validation rules
- Editable until approval.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "saved": true,
    "currentStep": 2,
    "completedSteps": [
      1
    ],
    "completionPercentage": 14,
    "totalSteps": 7,
    "canSubmit": false,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**403 ALREADY_APPROVED**
```json
{
  "success": false,
  "message": "Your profile is approved and can no longer be edited here.",
  "data": null,
  "errors": [
    {
      "code": "ALREADY_APPROVED",
      "message": "Your profile is approved and can no longer be edited here."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `403`

### cURL
```bash
curl -s -X POST http://localhost:5000/api/app/profile/personal \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"firstName":"Om","middleName":"","lastName":"Patel","dob":"1998-05-10","gender":"Male","maritalStatus":"Single","nationality":"Indian","bloodGroup":"O+","email":"om@example.com"}'
```

### Notes
- Draft is saved immediately; nothing is lost if the app closes.


---

## Save Address

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/address` |
| **Method** | POST |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
```json
{
  "present": {
    "line1": "12 MG Road",
    "line2": "",
    "area": "Navrangpura",
    "landmark": "Near Park",
    "city": "Ahmedabad",
    "district": "Ahmedabad",
    "state": "Gujarat",
    "country": "India",
    "pincode": "380009"
  },
  "sameAsPresent": true
}
```

### Validation rules
- Editable until approval.
- Set `sameAsPresent:true` to copy present → permanent.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "saved": true,
    "currentStep": 3,
    "completedSteps": [
      1,
      2
    ],
    "completionPercentage": 29,
    "totalSteps": 7,
    "canSubmit": false,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
_Standard envelope with `success:false`._

### HTTP status codes
- `200 OK`

### cURL
```bash
curl -s -X POST http://localhost:5000/api/app/profile/address \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"present":{"line1":"12 MG Road","line2":"","area":"Navrangpura","landmark":"Near Park","city":"Ahmedabad","district":"Ahmedabad","state":"Gujarat","country":"India","pincode":"380009"},"sameAsPresent":true}'
```

### Notes
- Structured address is composed into `presentAddress` / `permanentAddress`.


---

## Save Family / Nominee

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/family` |
| **Method** | POST |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
```json
{
  "fatherSpouseName": "Ramesh Patel",
  "emergencyContactName": "Ramesh Patel",
  "emergencyContact": "9876500000",
  "relationship": "Father",
  "nominee": {
    "name": "Ramesh Patel",
    "relationship": "Father",
    "share": 100
  }
}
```

### Validation rules
- Editable until approval.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "saved": true,
    "currentStep": 4,
    "completedSteps": [
      1,
      2,
      3
    ],
    "completionPercentage": 43,
    "totalSteps": 7,
    "canSubmit": false,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
_Standard envelope with `success:false`._

### HTTP status codes
- `200 OK`

### cURL
```bash
curl -s -X POST http://localhost:5000/api/app/profile/family \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"fatherSpouseName":"Ramesh Patel","emergencyContactName":"Ramesh Patel","emergencyContact":"9876500000","relationship":"Father","nominee":{"name":"Ramesh Patel","relationship":"Father","share":100}}'
```

### Notes
- Standard response envelope: { success, message, data, errors, timestamp }.


---

## Save Bank

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/bank` |
| **Method** | POST |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
```json
{
  "bankName": "HDFC Bank",
  "accountNumber": "50100123456789",
  "ifsc": "HDFC0001234",
  "accountHolderName": "Om Patel",
  "bankBranch": "Navrangpura",
  "accountType": "Savings"
}
```

### Validation rules
- Editable until approval.
- `accountNumber` and `ifsc` complete this step.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "saved": true,
    "currentStep": 5,
    "completedSteps": [
      1,
      2,
      3,
      4
    ],
    "completionPercentage": 57,
    "totalSteps": 7,
    "canSubmit": false,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
_Standard envelope with `success:false`._

### HTTP status codes
- `200 OK`

### cURL
```bash
curl -s -X POST http://localhost:5000/api/app/profile/bank \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"bankName":"HDFC Bank","accountNumber":"50100123456789","ifsc":"HDFC0001234","accountHolderName":"Om Patel","bankBranch":"Navrangpura","accountType":"Savings"}'
```

### Notes
- Standard response envelope: { success, message, data, errors, timestamp }.


---

## Save Education

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/education` |
| **Method** | POST |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
```json
{
  "education": [
    {
      "degree": "B.Tech",
      "institution": "GTU",
      "year": "2020",
      "grade": "8.2 CGPA"
    }
  ]
}
```

### Validation rules
- Editable until approval.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "saved": true,
    "currentStep": 6,
    "completedSteps": [
      1,
      2,
      3,
      4,
      5
    ],
    "completionPercentage": 71,
    "totalSteps": 7,
    "canSubmit": false,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
_Standard envelope with `success:false`._

### HTTP status codes
- `200 OK`

### cURL
```bash
curl -s -X POST http://localhost:5000/api/app/profile/education \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"education":[{"degree":"B.Tech","institution":"GTU","year":"2020","grade":"8.2 CGPA"}]}'
```

### Notes
- Standard response envelope: { success, message, data, errors, timestamp }.


---

## Save Experience

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/experience` |
| **Method** | POST |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
```json
{
  "experience": [
    {
      "company": "Acme Corp",
      "role": "Developer",
      "from": "2020-07",
      "to": "2023-06"
    }
  ]
}
```

### Validation rules
- Editable until approval. Optional step.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "saved": true,
    "currentStep": 7,
    "completedSteps": [
      1,
      2,
      3,
      4,
      5,
      6
    ],
    "completionPercentage": 86,
    "totalSteps": 7,
    "canSubmit": false,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
_Standard envelope with `success:false`._

### HTTP status codes
- `200 OK`

### cURL
```bash
curl -s -X POST http://localhost:5000/api/app/profile/experience \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"experience":[{"company":"Acme Corp","role":"Developer","from":"2020-07","to":"2023-06"}]}'
```

### Notes
- Standard response envelope: { success, message, data, errors, timestamp }.


---

## Save Documents (bulk)

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/documents` |
| **Method** | POST |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
```json
{
  "photo": "data:image/jpeg;base64,...",
  "documents": {
    "aadhaarDoc": {
      "name": "aadhaar.jpg",
      "dataUrl": "data:image/jpeg;base64,..."
    },
    "panDoc": {
      "name": "pan.jpg",
      "dataUrl": "..."
    },
    "bankProof": {
      "name": "passbook.jpg",
      "dataUrl": "..."
    }
  }
}
```

### Validation rules
- Editable until approval.
- Required for submission: photo, aadhaarDoc, panDoc, bankProof.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "saved": true,
    "currentStep": 7,
    "completedSteps": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "completionPercentage": 100,
    "totalSteps": 7,
    "canSubmit": true,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
_Standard envelope with `success:false`._

### HTTP status codes
- `200 OK`

### cURL
```bash
curl -s -X POST http://localhost:5000/api/app/profile/documents \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"photo":"data:image/jpeg;base64,...","documents":{"aadhaarDoc":{"name":"aadhaar.jpg","dataUrl":"data:image/jpeg;base64,..."},"panDoc":{"name":"pan.jpg","dataUrl":"..."},"bankProof":{"name":"passbook.jpg","dataUrl":"..."}}}'
```

### Notes
- Prefer per-file uploads via POST /profile/document for large images.


---

## Upload Single Document

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/document` |
| **Method** | POST |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
```json
{
  "type": "aadhaar",
  "name": "aadhaar.jpg",
  "dataUrl": "data:image/jpeg;base64,..."
}
```

### Validation rules
- `type` is required: aadhaar | pan | photo | signature | passbook | degree | experience | other.
- `dataUrl` (base64) is required.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "uploaded": "aadhaarDoc",
    "currentStep": 7,
    "completedSteps": [
      1,
      2,
      3,
      4,
      5,
      6
    ],
    "completionPercentage": 86,
    "totalSteps": 7,
    "canSubmit": false,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**400 TYPE_REQUIRED**
```json
{
  "success": false,
  "message": "Document type is required.",
  "data": null,
  "errors": [
    {
      "code": "TYPE_REQUIRED",
      "message": "Document type is required."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

**400 CONTENT_REQUIRED**
```json
{
  "success": false,
  "message": "Document content is required.",
  "data": null,
  "errors": [
    {
      "code": "CONTENT_REQUIRED",
      "message": "Document content is required."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `400`

### cURL
```bash
curl -s -X POST http://localhost:5000/api/app/profile/document \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"type":"aadhaar","name":"aadhaar.jpg","dataUrl":"data:image/jpeg;base64,..."}'
```

### Notes
- `photo` is stored as the profile photo; others are kept under their document key.


---

## Progress

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `GET /api/app/profile/progress` |
| **Method** | GET |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
_None._

### Validation rules
- Valid access token required.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "currentStep": 5,
    "completedSteps": [
      1,
      2,
      3,
      4
    ],
    "completionPercentage": 71,
    "totalSteps": 7,
    "canSubmit": false,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
_Standard envelope with `success:false`._

### HTTP status codes
- `200 OK`

### cURL
```bash
curl -s -X GET http://localhost:5000/api/app/profile/progress \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

### Notes
- Drives the registration stepper UI and the “Send For Approval” button state.


---

## Submit For Approval

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/submit` |
| **Method** | POST |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
_None._

### Validation rules
- All mandatory fields + documents must be present.
- Cannot submit an already-approved profile.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "approvalStatus": "Pending Approval",
    "submittedAt": "2026-06-25T12:00:00.000Z"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**422 VALIDATION_FAILED**
```json
{
  "success": false,
  "message": "Please complete all required fields and documents before submitting.",
  "data": null,
  "errors": [
    {
      "code": "VALIDATION_FAILED",
      "message": "Please complete all required fields and documents before submitting."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

**400 ALREADY_APPROVED**
```json
{
  "success": false,
  "message": "Your profile is already approved.",
  "data": null,
  "errors": [
    {
      "code": "ALREADY_APPROVED",
      "message": "Your profile is already approved."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `422`
- `400`

### cURL
```bash
curl -s -X POST http://localhost:5000/api/app/profile/submit \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

### Notes
- On success the record enters the HR website “Pending Approval” queue.
- 422 returns an `errors[]` array of missing fields/documents.


---

## Approval Status

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `GET /api/app/profile/status` |
| **Method** | GET |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
_None._

### Validation rules
- Valid access token required.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "approvalStatus": "Pending Approval",
    "completionPercentage": 100
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
_Standard envelope with `success:false`._

### HTTP status codes
- `200 OK`

### cURL
```bash
curl -s -X GET http://localhost:5000/api/app/profile/status \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

### Notes
- Values: Draft | Pending Approval | Approved | Rejected | Changes Requested.
- If Rejected / Changes Requested, a `remarks` field is included.


---

## Update Profile

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `PUT /api/app/profile/update` |
| **Method** | PUT |
| **Authentication** | Bearer access token |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
```json
{
  "email": "new@example.com",
  "presentAddress": "12 MG Road, Ahmedabad"
}
```

### Validation rules
- Before approval edits the draft; after approval edits limited Employee fields.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "currentStep": 5,
    "completedSteps": [
      1,
      2,
      3,
      4
    ],
    "completionPercentage": 71,
    "totalSteps": 7,
    "canSubmit": false,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
_Standard envelope with `success:false`._

### HTTP status codes
- `200 OK`

### cURL
```bash
curl -s -X PUT http://localhost:5000/api/app/profile/update \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"email":"new@example.com","presentAddress":"12 MG Road, Ahmedabad"}'
```

### Notes
- Standard response envelope: { success, message, data, errors, timestamp }.


---


# Dashboard

## Dashboard

**Group:** Dashboard

| | |
|---|---|
| **Endpoint** | `GET /api/app/dashboard` |
| **Method** | GET |
| **Authentication** | Bearer access token (approved employees only) |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
_None._

### Validation rules
- Available only after HR approval.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "employeeId": "VE-AHM-001",
    "name": "Om Patel",
    "designation": "Developer",
    "department": "IT",
    "company": "Vision Enterprise",
    "branch": "Ahmedabad",
    "todayAttendance": {
      "status": "Present",
      "clockIn": "09:05",
      "clockOut": "18:10"
    },
    "pendingLeaveRequests": 1,
    "latestPayrollNet": 42000
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**403 NOT_APPROVED**
```json
{
  "success": false,
  "message": "Dashboard is available only after HR approval.",
  "data": null,
  "errors": [
    {
      "code": "NOT_APPROVED",
      "message": "Dashboard is available only after HR approval."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `403`

### cURL
```bash
curl -s -X GET http://localhost:5000/api/app/dashboard \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

### Notes
- Redirect to the appropriate screen unless approvalStatus === Approved.


---

## Employee Profile

**Group:** Dashboard

| | |
|---|---|
| **Endpoint** | `GET /api/app/profile` |
| **Method** | GET |
| **Authentication** | Bearer access token (approved employees only) |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
_None._

### Validation rules
- Available only after HR approval.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "employeeId": "VE-AHM-001",
    "name": "Om Patel",
    "email": "om@example.com",
    "mobile": "9876543210",
    "department": "IT",
    "designation": "Developer",
    "company": {
      "id": 2,
      "name": "Vision Enterprise"
    },
    "branch": {
      "id": 5,
      "name": "Ahmedabad"
    }
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**403 NOT_APPROVED**
```json
{
  "success": false,
  "message": "Dashboard is available only after HR approval.",
  "data": null,
  "errors": [
    {
      "code": "NOT_APPROVED",
      "message": "Dashboard is available only after HR approval."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `403`

### cURL
```bash
curl -s -X GET http://localhost:5000/api/app/profile \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

### Notes
- Standard response envelope: { success, message, data, errors, timestamp }.


---

## Profile Documents

**Group:** Dashboard

| | |
|---|---|
| **Endpoint** | `GET /api/app/profile/documents` |
| **Method** | GET |
| **Authentication** | Bearer access token (approved employees only) |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
_None._

### Validation rules
- Available only after HR approval.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "photo": "data:image/jpeg;base64,...",
    "documents": {
      "aadhaarDoc": {
        "name": "aadhaar.jpg"
      },
      "panDoc": {
        "name": "pan.jpg"
      }
    }
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**403 NOT_APPROVED**
```json
{
  "success": false,
  "message": "Dashboard is available only after HR approval.",
  "data": null,
  "errors": [
    {
      "code": "NOT_APPROVED",
      "message": "Dashboard is available only after HR approval."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `403`

### cURL
```bash
curl -s -X GET http://localhost:5000/api/app/profile/documents \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

### Notes
- Standard response envelope: { success, message, data, errors, timestamp }.


---

## Attendance

**Group:** Dashboard

| | |
|---|---|
| **Endpoint** | `GET /api/app/attendance` |
| **Method** | GET |
| **Authentication** | Bearer access token (approved employees only) |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
_None._

### Validation rules
- Available only after HR approval.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "summary": {
      "totalRecords": 22,
      "presentDays": 20
    },
    "records": [
      {
        "date": "2026-06-24",
        "status": "Present",
        "clockIn": "09:05",
        "clockOut": "18:10",
        "hoursWorked": 8.5
      }
    ]
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**403 NOT_APPROVED**
```json
{
  "success": false,
  "message": "Dashboard is available only after HR approval.",
  "data": null,
  "errors": [
    {
      "code": "NOT_APPROVED",
      "message": "Dashboard is available only after HR approval."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `403`

### cURL
```bash
curl -s -X GET http://localhost:5000/api/app/attendance \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

### Notes
- Standard response envelope: { success, message, data, errors, timestamp }.


---

## Leave List

**Group:** Dashboard

| | |
|---|---|
| **Endpoint** | `GET /api/app/leave` |
| **Method** | GET |
| **Authentication** | Bearer access token (approved employees only) |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
_None._

### Validation rules
- Available only after HR approval.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "requests": [
      {
        "id": 12,
        "leaveType": "Casual",
        "fromDate": "2026-06-20",
        "toDate": "2026-06-21",
        "days": 2,
        "reason": "Personal",
        "status": "Pending",
        "appliedOn": "2026-06-18"
      }
    ]
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**403 NOT_APPROVED**
```json
{
  "success": false,
  "message": "Dashboard is available only after HR approval.",
  "data": null,
  "errors": [
    {
      "code": "NOT_APPROVED",
      "message": "Dashboard is available only after HR approval."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `403`

### cURL
```bash
curl -s -X GET http://localhost:5000/api/app/leave \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

### Notes
- Standard response envelope: { success, message, data, errors, timestamp }.


---

## Apply Leave

**Group:** Dashboard

| | |
|---|---|
| **Endpoint** | `POST /api/app/leave/apply` |
| **Method** | POST |
| **Authentication** | Bearer access token (approved employees only) |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
```json
{
  "leaveType": "Casual",
  "fromDate": "2026-07-01",
  "toDate": "2026-07-02",
  "days": 2,
  "reason": "Family function"
}
```

### Validation rules
- `leaveType`, `fromDate`, `toDate` are required.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": 31,
    "status": "Pending"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**422 VALIDATION_FAILED**
```json
{
  "success": false,
  "message": "leaveType, fromDate and toDate are required.",
  "data": null,
  "errors": [
    {
      "code": "VALIDATION_FAILED",
      "message": "leaveType, fromDate and toDate are required."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

**403 NOT_APPROVED**
```json
{
  "success": false,
  "message": "Dashboard is available only after HR approval.",
  "data": null,
  "errors": [
    {
      "code": "NOT_APPROVED",
      "message": "Dashboard is available only after HR approval."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `422`
- `403`

### cURL
```bash
curl -s -X POST http://localhost:5000/api/app/leave/apply \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"leaveType":"Casual","fromDate":"2026-07-01","toDate":"2026-07-02","days":2,"reason":"Family function"}'
```

### Notes
- Standard response envelope: { success, message, data, errors, timestamp }.


---

## Payroll

**Group:** Dashboard

| | |
|---|---|
| **Endpoint** | `GET /api/app/payroll` |
| **Method** | GET |
| **Authentication** | Bearer access token (approved employees only) |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
_None._

### Validation rules
- Available only after HR approval.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "payslips": [
      {
        "id": 5,
        "month": "June",
        "year": 2026,
        "basicSalary": 21000,
        "allowances": 15000,
        "deductions": 4000,
        "netSalary": 42000,
        "paymentStatus": "pending",
        "payslipGenerated": false
      }
    ]
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**403 NOT_APPROVED**
```json
{
  "success": false,
  "message": "Dashboard is available only after HR approval.",
  "data": null,
  "errors": [
    {
      "code": "NOT_APPROVED",
      "message": "Dashboard is available only after HR approval."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `403`

### cURL
```bash
curl -s -X GET http://localhost:5000/api/app/payroll \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

### Notes
- Standard response envelope: { success, message, data, errors, timestamp }.


---

## Notifications

**Group:** Dashboard

| | |
|---|---|
| **Endpoint** | `GET /api/app/notifications` |
| **Method** | GET |
| **Authentication** | Bearer access token (approved employees only) |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
_None._

### Validation rules
- Available only after HR approval.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "notifications": [
      {
        "id": 9,
        "type": "announcement",
        "title": "Holiday",
        "message": "Office closed on Friday",
        "read": false,
        "timestamp": "2026-06-24 10:00"
      }
    ]
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**403 NOT_APPROVED**
```json
{
  "success": false,
  "message": "Dashboard is available only after HR approval.",
  "data": null,
  "errors": [
    {
      "code": "NOT_APPROVED",
      "message": "Dashboard is available only after HR approval."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `403`

### cURL
```bash
curl -s -X GET http://localhost:5000/api/app/notifications \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

### Notes
- Standard response envelope: { success, message, data, errors, timestamp }.


---

## Holidays

**Group:** Dashboard

| | |
|---|---|
| **Endpoint** | `GET /api/app/holiday` |
| **Method** | GET |
| **Authentication** | Bearer access token (approved employees only) |

### Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Request body
_None._

### Validation rules
- Available only after HR approval.

### Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "holidays": []
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### Error responses
**403 NOT_APPROVED**
```json
{
  "success": false,
  "message": "Dashboard is available only after HR approval.",
  "data": null,
  "errors": [
    {
      "code": "NOT_APPROVED",
      "message": "Dashboard is available only after HR approval."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP status codes
- `200 OK`
- `403`

### cURL
```bash
curl -s -X GET http://localhost:5000/api/app/holiday \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>'
```

### Notes
- Holiday calendar source is configurable; returns an empty list until configured.


---

