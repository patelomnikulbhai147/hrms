# API Sequence Flow

## Company Head / HR Auth Flow
1. **Email** -> Client prompts for email.
2. **Password** -> Client prompts for password.
3. **Login API** `POST /auth/login` -> Returns `otpSessionId`.
4. **Email OTP** -> User checks email.
5. **Verify API** `POST /auth/verify-otp` -> Returns `token` (JWT) and `refreshToken`.
6. **Dashboard API** `GET /dashboard` using `Bearer <token>`.

## Employee Auth Flow
1. **Mobile Number** -> Client prompts for Mobile Number.
2. **Login API** `POST /employee/login` -> Returns `otpSessionId`.
3. **SMS OTP** -> User checks SMS.
4. **Verify API** `POST /employee/verify-otp` -> Returns `token` (JWT).
5. **Dashboard API** `GET /dashboard` using `Bearer <token>`.
