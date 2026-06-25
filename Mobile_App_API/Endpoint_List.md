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
