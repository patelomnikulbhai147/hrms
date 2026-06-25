# Authentication Flow

```
Splash (no API)  →  token present?
   │ no                              │ yes
   ▼                                 ▼
Phone Number Screen            GET /api/app/auth/session
   │ POST /api/app/auth/login         │
   ▼                                 ├─ Not logged in        → Phone Screen
{ sessionId, otpLength:4 }           ├─ Registration incomplete → Resume Step
   │ (no SMS in development)         ├─ Pending Approval     → Pending screen
   ▼                                 └─ Approved             → Dashboard
OTP Screen (any 4 digits)
   │ POST /api/app/auth/verify-otp
   ▼
{ accessToken, refreshToken, currentStep, approvalStatus }
   │ store tokens
   ▼
Resume registration / dashboard
```

- Only mobiles linked to a **Temporary Employee ID** can log in; others get `EMPLOYEE_NOT_FOUND`.
- On any 401, call `POST /api/app/auth/refresh` and retry.
