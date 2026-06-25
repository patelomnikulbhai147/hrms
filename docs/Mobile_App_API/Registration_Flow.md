# Registration Flow (resume-safe)

Seven steps, each saved as a draft to the server immediately. Closing the app loses nothing.

| Step | Endpoint | Completes when |
|------|----------|----------------|
| 1 Personal | `POST /api/app/profile/personal` | name + dob/gender |
| 2 Address | `POST /api/app/profile/address` | present address |
| 3 Family/Nominee | `POST /api/app/profile/family` | nominee / emergency contact |
| 4 Bank | `POST /api/app/profile/bank` | account number + IFSC |
| 5 Education | `POST /api/app/profile/education` | at least one entry |
| 6 Experience | `POST /api/app/profile/experience` | at least one entry (optional) |
| 7 Documents | `POST /api/app/profile/document` | photo + Aadhaar + PAN + Bank proof |

- Track progress with `GET /api/app/profile/progress` (`currentStep`, `completedSteps`, `completionPercentage`, `canSubmit`).
- Resume on app start with `GET /api/app/auth/session` → open `currentStep`.
- Submit with `POST /api/app/profile/submit` (blocks with 422 + `errors[]` until complete).
- After submit the record appears in the HR website under **Applications → Pending Approval**.
- Status via `GET /api/app/profile/status`. If **Rejected**/**Changes Requested**, `remarks` explain why; edit and resubmit.
- Dashboard endpoints unlock only when status is **Approved**.
