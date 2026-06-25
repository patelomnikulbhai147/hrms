# HRMS Mobile Authentication (v1) — Flutter Integration Guide

OTP-based auth for the HRMS mobile app. **Additive & isolated** — the existing web
login (`POST /api/auth/login`, email + password) is untouched. This module lives at
**`/api/v1/auth`** so the contract is versioned and stable.

> The **access token is a standard Bearer JWT** accepted by *every* protected HRMS
> endpoint. Once you have it, call any existing API with `Authorization: Bearer <accessToken>`.

---

## Flow

```
Enter Mobile / Employee ID / Email
        │  POST /api/v1/auth/login
        ▼
{ sessionId, otpRequired:true, otpLength:4 }       ← no SMS in development mode
        │
OTP screen (user types any 4 digits in dev)
        │  POST /api/v1/auth/verify-otp { sessionId, otp }
        ▼
{ accessToken, refreshToken, expiresIn, user{...} }
        │
Store tokens → call protected APIs with Bearer accessToken
        │  on 401 → POST /api/v1/auth/refresh { refreshToken }
        ▼
{ accessToken }   (new)
```

The **OTP screen and all Flutter code stay the same** when the backend switches from
`OTP_MODE=development` to `production` — only the backend changes.

---

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/v1/auth/login` | — | Accept mobile/employeeId/email → create OTP session |
| `POST` | `/api/v1/auth/verify-otp` | — | Verify OTP → access + refresh tokens + profile |
| `POST` | `/api/v1/auth/refresh` | — | New access token from a refresh token |
| `POST` | `/api/v1/auth/logout` | Bearer | End session (client discards tokens) |
| `GET`  | `/api/v1/auth/me` | Bearer | Current authenticated user |
| `GET`  | `/api/v1/auth/openapi.json` | — | OpenAPI 3 spec (import into Postman/Swagger) |
| `GET`  | `/api/v1/auth` | — | Service info (mode, otpLength) |

---

## Sample curl

```bash
BASE=http://localhost:5000

# 1) Login (any one identifier)
curl -s -X POST $BASE/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"mobile":"9876543210"}'
# → { "success":true, "sessionId":"...", "otpLength":4, "otpMode":"development", "devOtp":"1111" }

# 2) Verify OTP (any 4 digits in development)
curl -s -X POST $BASE/api/v1/auth/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"PASTE_SESSION_ID","otp":"1234"}'
# → { "success":true, "accessToken":"...", "refreshToken":"...", "expiresIn":3600, "user":{...} }

# 3) Call a protected API (or /me)
curl -s $BASE/api/v1/auth/me -H "Authorization: Bearer PASTE_ACCESS_TOKEN"

# 4) Refresh
curl -s -X POST $BASE/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"PASTE_REFRESH_TOKEN"}'
```

---

## User profile (returned by verify-otp and /me)

```json
{
  "id": 1,
  "employeeId": "VE-AHM-001",
  "employeeCode": "VE-AHM-001",
  "firstName": "Om",
  "lastName": "Patel",
  "email": "abc@gmail.com",
  "mobile": "9876543210",
  "company": { "id": 2, "name": "Vision Enterprise" },
  "branch": { "id": 5, "name": "Ahmedabad" },
  "department": "IT",
  "designation": "Developer",
  "role": "Employee",
  "permissions": ["attendance.view", "attendance.mark", "leave.create"],
  "profileImage": "",
  "isFirstLogin": false,
  "isPasswordCreated": true
}
```

`permissionMatrix` (nested `{module:{action:bool}}`) and `moduleAccess` are also
included for richer client-side gating.

---

## Error responses (consistent envelope)

```json
{ "success": false, "message": "User not found", "code": "USER_NOT_FOUND" }
```

| HTTP | code | meaning |
|------|------|---------|
| 400 | `IDENTIFIER_REQUIRED` | no mobile/employeeId/email supplied |
| 404 | `USER_NOT_FOUND` | identifier not registered |
| 403 | `ACCOUNT_INACTIVE` | user status is not Active |
| 403 | `BRANCH_DISABLED` | the user's branch is archived/disabled |
| 400 | `INVALID_SESSION` / `SESSION_CONSUMED` | bad/used sessionId |
| 400 | `OTP_EXPIRED` | OTP session expired (default 5 min) |
| 400 | `INVALID_OTP` | wrong code (or wrong length in dev) |
| 429 | `TOO_MANY_ATTEMPTS` | 5 failed attempts on a session |
| 401 | `REFRESH_TOKEN_INVALID` | refresh token expired/invalid |

---

## Environment variables

```
JWT_SECRET=               # shared with web auth — access token secret
JWT_REFRESH_SECRET=       # refresh token secret (falls back to a derived value)
ACCESS_TOKEN_EXPIRY=1h
REFRESH_TOKEN_EXPIRY=30d
OTP_MODE=development      # development = any N-digit code, no SMS; production = real SMS OTP
OTP_LENGTH=4
OTP_EXPIRY=5m
SMS_PROVIDER=             # production only
SMS_API_KEY=              # production only
```

**Going to production:** set `OTP_MODE=production`, configure `SMS_PROVIDER`/`SMS_API_KEY`,
and implement the provider call in `otpService.sendSms()`. No Flutter changes required.

---

## Postman

Import `HRMS_Mobile_Auth.postman_collection.json` (in this folder) or import the live
spec URL `{{baseUrl}}/api/v1/auth/openapi.json`. The Login and Verify requests
auto-capture `sessionId` / `accessToken` / `refreshToken` into collection variables.

## Folder map

```
backend/src/auth/
├── authController.js   # request handlers (login, verify-otp, refresh, logout, me)
├── authService.js      # resolve identifier → User (+Employee), build rich profile
├── otpService.js       # OTP session create/verify, dev & production modes
├── jwtService.js       # access + refresh token sign/verify
├── authRoutes.js       # router (mounted at /api/v1/auth)
├── openapi.json        # OpenAPI 3 documentation
├── HRMS_Mobile_Auth.postman_collection.json
└── README.md
```
