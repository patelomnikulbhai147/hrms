# Save Experience

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/experience` |
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
  "experience": [
    {
      "company": "Acme Corp",
      "role": "Developer",
      "from": "2020-07",
      "to": "2023-06"
    }
  ]
}
```

## Validation rules
- Editable until approval. Optional step.

## Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "saved": true,
    "currentStep": 7,
    "completedSteps": [
      1,
      2,
      3,
      4,
      5,
      6
    ],
    "completionPercentage": 86,
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
curl -s -X POST http://localhost:5000/api/app/profile/experience \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"experience":[{"company":"Acme Corp","role":"Developer","from":"2020-07","to":"2023-06"}]}'
```

## Notes
- Standard response envelope: { success, message, data, errors, timestamp }.
