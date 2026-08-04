# Flutter Integration Notes

## API Execution Order
1. Call `login` endpoint first to get the OTP Session ID.
2. Call `verify-otp` with the Session ID to retrieve the JWT.
3. Once authenticated, call `/dashboard` and `/profile` to load the home screen.

## JWT Storage
- Use **flutter_secure_storage** to store the `token` and `refreshToken`.
- DO NOT store tokens in SharedPreferences.

## Token Refresh (Interceptors)
- Attach an interceptor (e.g. using Dio) to catch `401 Unauthorized`.
- Upon `401`, pause queued requests, call `/auth/refresh` with the refresh token.
- If refresh succeeds, update secure storage and retry queued requests.
- If refresh fails, log the user out and navigate to Splash/Login.

## Authorization Header
- Prefix the token: `Authorization: Bearer <token>`.
- Required on ALL endpoints except `/login` and `/verify-otp`.

## Timeout & Retry
- **Timeout:** Set a connection/receive timeout of **15,000ms** (15 seconds).
- **Retry:** Implement a max 3-retry policy for 5xx errors or network timeouts. Do NOT retry on 4xx errors (except 401 via refresh).
