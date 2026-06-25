# Save Family / Nominee

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/family` |
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
  "fatherSpouseName": "Ramesh Patel",
  "emergencyContactName": "Ramesh Patel",
  "emergencyContact": "9876500000",
  "relationship": "Father",
  "nominee": {
    "name": "Ramesh Patel",
    "relationship": "Father",
    "share": 100
  }
}
```

## Validation rules
- Editable until approval.

## Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "saved": true,
    "currentStep": 4,
    "completedSteps": [
      1,
      2,
      3
    ],
    "completionPercentage": 43,
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
curl -s -X POST http://localhost:5000/api/app/profile/family \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"fatherSpouseName":"Ramesh Patel","emergencyContactName":"Ramesh Patel","emergencyContact":"9876500000","relationship":"Father","nominee":{"name":"Ramesh Patel","relationship":"Father","share":100}}'
```

## Notes
- Standard response envelope: { success, message, data, errors, timestamp }.
