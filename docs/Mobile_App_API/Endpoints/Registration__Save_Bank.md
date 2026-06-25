# Save Bank

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/bank` |
| **Method** | POST |
| **Authentication** | Bearer access token |

## Headers
```
Content-Type: application/json
Authorization: Bearer <accessToken>
```

## Request body
```json
{
  "bankName": "HDFC Bank",
  "accountNumber": "50100123456789",
  "ifsc": "HDFC0001234",
  "accountHolderName": "Om Patel",
  "bankBranch": "Navrangpura",
  "accountType": "Savings"
}
```

## Validation rules
- Editable until approval.
- `accountNumber` and `ifsc` complete this step.

## Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "saved": true,
    "currentStep": 5,
    "completedSteps": [
      1,
      2,
      3,
      4
    ],
    "completionPercentage": 57,
    "totalSteps": 7,
    "canSubmit": false,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## Error responses
_Standard envelope with `success:false`._

## HTTP status codes
- `200 OK`

## cURL
```bash
curl -s -X POST http://localhost:5000/api/app/profile/bank \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"bankName":"HDFC Bank","accountNumber":"50100123456789","ifsc":"HDFC0001234","accountHolderName":"Om Patel","bankBranch":"Navrangpura","accountType":"Savings"}'
```

## Notes
- Standard response envelope: { success, message, data, errors, timestamp }.
