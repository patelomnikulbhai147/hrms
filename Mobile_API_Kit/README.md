# HRMS Mobile API Kit (v1)

Self-contained integration kit for the **HRMS Flutter mobile app**. Everything the
mobile developer needs to integrate authentication is in this folder — no backend
source access required.

> Auth is **OTP-based**. Login accepts **Mobile number, Employee ID, or Email**.
> The access token is a standard **Bearer JWT** accepted by every protected HRMS API.

---

## 1. Project overview

The HRMS backend exposes a versioned mobile auth API at `/api/v1/auth`. The app
collects an identifier, the backend issues an OTP session, the user enters the OTP,
and the backend returns an **access token + refresh token + full user profile**.

## 2. Base URL

```
Development:  http://localhost:5000
Production:   http://<YOUR_SERVER_IP_OR_DOMAIN>     (nginx proxies /api to backend)
Auth path:    /api/v1/auth
```

See `BASE_URL.txt`.

## 3. Authentication flow

```
Enter Mobile / Employee ID / Email
        │  POST /api/v1/auth/login
        ▼
{ sessionId, otpRequired:true, otpLength:4 }      (no SMS in development)
        │
OTP screen  (user types any 4 digits during development)
        │  POST /api/v1/auth/verify-otp { sessionId, otp }
        ▼
{ accessToken, refreshToken, expiresIn, user{...} }
        │
Store tokens → call protected APIs with  Authorization: Bearer <accessToken>
        │  on 401 → POST /api/v1/auth/refresh { refreshToken }
        ▼
{ accessToken }  (new)
```

## 4. Login flow
1. User types Mobile / Employee ID / Email.
2. App calls `POST /login`.
3. Backend returns `sessionId` + `otpLength`. (In development it also returns `devOtp`.)
4. App navigates to the OTP screen.

## 5. OTP verification flow
1. User enters the OTP (**any 4 digits during development**).
2. App calls `POST /verify-otp` with `sessionId` + `otp`.
3. Backend returns `accessToken`, `refreshToken`, `expiresIn`, and `user`.
4. App stores tokens securely and routes to the home screen.

## 6. Token refresh flow
- When an API returns **401**, call `POST /refresh` with the `refreshToken`.
- Replace the stored `accessToken` with the new one and retry the original request.

## 7. Logout flow
- Call `POST /logout` with the Bearer access token, then clear stored tokens locally.

## 8. Authorization header format
```
Authorization: Bearer <accessToken>
```

## 9. Common error codes
| HTTP | code | meaning |
|------|------|---------|
| 400 | IDENTIFIER_REQUIRED | no identifier supplied |
| 404 | USER_NOT_FOUND | identifier not registered |
| 403 | ACCOUNT_INACTIVE | user account is not active |
| 403 | BRANCH_DISABLED | the user's branch is disabled |
| 400 | INVALID_SESSION / SESSION_CONSUMED | bad/used sessionId |
| 400 | OTP_EXPIRED | OTP session expired (default 5 min) |
| 400 | INVALID_OTP | wrong code (or wrong length in development) |
| 429 | TOO_MANY_ATTEMPTS | 5 failed attempts on a session |
| 401 | REFRESH_TOKEN_INVALID | refresh token expired/invalid |
| 500 | SERVER_ERROR | unexpected server error |

## 10. Integration steps
1. Set the base URL (`BASE_URL.txt`).
2. Build the Login screen (Mobile / Employee ID / Email field) → `POST /login`.
3. Build the OTP screen → `POST /verify-otp`. **Always show this screen**, even in development.
4. Store `accessToken` + `refreshToken` securely (see `Flutter_Guide/Token_Storage.md`).
5. Attach `Authorization: Bearer <accessToken>` to every protected request.
6. On 401, refresh the token and retry (see `Flutter_Guide/Error_Handling.md`).
7. Use `GET /me` to load the current profile on app start.
8. Wire Logout → `POST /logout` + clear local storage.

## 11. Temporary OTP (development)
- The Flutter app **must always display the OTP screen**.
- During development the backend accepts **any 4-digit OTP**.
- **No SMS is currently sent.**
- Controlled by backend env `OTP_MODE=development`.
- When switched to `OTP_MODE=production`, the **app keeps the same APIs and code** —
  only real SMS OTPs will be required.

## 12. Contact notes for backend changes
If you need a new field in the profile, an extra endpoint, or a permission added,
request it from the **backend team** — do not hardcode values in the app. The API
contract in this kit (`OpenAPI_Swagger.yaml`) is the source of truth.

## Folder map
```
Mobile_API_Kit/
├── README.md                     ← you are here
├── BASE_URL.txt
├── Environment_Example.txt
├── API_Documentation.md / .pdf
├── AUTH_FLOW.pdf
├── Postman_Collection.json
├── OpenAPI_Swagger.yaml
├── Authentication/   (per-endpoint docs)
├── Request_Examples/ (sample request bodies)
├── Response_Examples/(sample responses)
├── Models/           (JSON schemas)
└── Flutter_Guide/    (Dart how-to)
```
