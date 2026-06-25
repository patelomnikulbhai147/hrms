# Flutter — Integration Checklist

- [ ] Set API base URL per environment (`BASE_URL.txt`).
- [ ] Login screen accepts Mobile / Employee ID / Email → `POST /login`.
- [ ] Persist `sessionId`; navigate to OTP screen.
- [ ] OTP screen always shown; **any 4 digits** work in development.
- [ ] `POST /verify-otp` → store `accessToken` + `refreshToken` (secure storage).
- [ ] Parse and hold the `user` profile (Models/User_Model.json).
- [ ] Dio request interceptor attaches `Authorization: Bearer <accessToken>`.
- [ ] Dio error interceptor refreshes on 401 and retries once.
- [ ] App start: read token → `GET /me` → route Home or Login.
- [ ] Logout → `POST /logout` → clear secure storage.
- [ ] Gate UI using `user.permissions` (e.g. `attendance.mark`).
- [ ] Show friendly copy for each error `code`.
- [ ] Confirm nothing breaks when backend flips `OTP_MODE=production` (no app change).
