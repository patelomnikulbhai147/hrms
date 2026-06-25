# API Version History

## v1.0.0 — 2026-06-25
- Initial Mobile App API under `/api/app`.
- OTP login linked to Temporary Employee records (development mode: any 4-digit OTP, no SMS).
- 7-step resume-safe registration with draft autosave + completion tracking.
- Submit-for-approval into the existing HR approval queue.
- Approval status lifecycle: Draft → Pending Approval → Approved / Rejected / Changes Requested.
- Approval-gated dashboard: profile, attendance, leave (+apply), payroll, notifications, holidays.
- Standard response envelope on every endpoint.
