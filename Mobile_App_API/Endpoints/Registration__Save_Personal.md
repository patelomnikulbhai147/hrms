# Save Personal

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/personal` |
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
  "firstName": "Om",
  "middleName": "",
  "lastName": "Patel",
  "dob": "1998-05-10",
  "gender": "Male",
  "maritalStatus": "Single",
  "nationality": "Indian",
  "bloodGroup": "O+",
  "email": "om@example.com"
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
    "currentStep": 2,
    "completedSteps": [
      1
    ],
    "completionPercentage": 14,
    "totalSteps": 7,
    "canSubmit": false,
    "approvalStatus": "Draft"
  },
  "errors": [],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## Error responses
**403 ALREADY_APPROVED**
```json
{
  "success": false,
  "message": "Your profile is approved and can no longer be edited here.",
  "data": null,
  "errors": [
    {
      "code": "ALREADY_APPROVED",
      "message": "Your profile is approved and can no longer be edited here."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## HTTP status codes
- `200 OK`
- `403`

## cURL
```bash
curl -s -X POST http://localhost:5000/api/app/profile/personal \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"firstName":"Om","middleName":"","lastName":"Patel","dob":"1998-05-10","gender":"Male","maritalStatus":"Single","nationality":"Indian","bloodGroup":"O+","email":"om@example.com"}'
```

## Notes
- Draft is saved immediately; nothing is lost if the app closes.
