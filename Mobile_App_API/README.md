# HRMS Mobile App API Kit (v1)

Self-contained integration kit for the **HRMS employee mobile app** (Flutter). A
Flutter developer can integrate using only this folder — no backend source needed.

- **Base path:** `/api/app` (separate from the website API `/api/*`).
- **Login:** by **mobile number**, which must be linked to a **Temporary Employee ID**.
- **OTP:** development mode accepts **any 4-digit code**, no SMS sent.
- **Registration:** 7 resume-safe steps; drafts autosave; submit for HR approval.
- **Dashboard:** unlocks only after HR **Approved**.

## Contents
- `API_Documentation.md` / `.pdf` — complete reference (all endpoints)
- `Endpoint_List.md`, `Error_Codes.md`, `Status_Codes.md`, `API_Version_History.md`
- `Authentication_Flow.md`, `Registration_Flow.md`
- `Flutter_Integration_Guide.md`
- `OpenAPI_Swagger.yaml`, `Postman_Collection.json`
- `Endpoints/` (per-endpoint docs), `Request_Examples/`, `Response_Examples/`, `Models/`
- `BASE_URL.txt`

## Quick start
1. Set base URL (`BASE_URL.txt`).
2. `POST /api/app/auth/login` with `{ "mobile": "..." }`.
3. Show OTP screen → `POST /api/app/auth/verify-otp` with `{ sessionId, otp }`.
4. Store `accessToken` + `refreshToken`; send `Authorization: Bearer <accessToken>`.
5. Drive navigation with `GET /api/app/auth/session`.
6. Save steps, then `POST /api/app/profile/submit`; poll `GET /api/app/profile/status`.
7. When Approved, call the dashboard endpoints.

See `Authentication_Flow.md` and `Registration_Flow.md` for the full picture.
