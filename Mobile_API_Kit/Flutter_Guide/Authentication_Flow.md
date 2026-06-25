# Flutter — Authentication Flow

1. **Login screen**: one input that accepts Mobile / Employee ID / Email.
   - Call `POST /api/v1/auth/login` with the matching key.
   - On success, store the `sessionId` in memory and push the OTP screen.
2. **OTP screen** (always shown):
   - 4 input boxes. During development **any 4 digits work**.
   - Call `POST /api/v1/auth/verify-otp` with `{ sessionId, otp }`.
   - On success, persist `accessToken` + `refreshToken` and route to Home.
3. **App start / splash**:
   - If a token exists, call `GET /api/v1/auth/me` to hydrate the user.
   - If it returns 401, try `POST /refresh`; if that also fails, go to Login.
4. **Logout**: `POST /logout` then clear secure storage.

State management tip: keep an `AuthState { user, accessToken }` in your provider/bloc,
hydrated from secure storage on boot.
