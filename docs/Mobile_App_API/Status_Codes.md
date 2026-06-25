# HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful request |
| 201 | Created | Leave application created |
| 400 | Bad Request | Missing/invalid input, bad OTP/session |
| 401 | Unauthorized | Missing/expired/invalid token |
| 403 | Forbidden | Dashboard before approval (NOT_APPROVED) |
| 404 | Not Found | Mobile not linked to a Temp Employee |
| 422 | Unprocessable | Submission/validation failed (errors[]) |
| 429 | Too Many Requests | OTP attempts exceeded |
| 500 | Server Error | Unexpected backend error |

## Approval status values
`Draft` → `Pending Approval` → `Approved` (or `Rejected` / `Changes Requested`)
