# Save Documents (bulk)

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/documents` |
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
  "photo": "data:image/jpeg;base64,...",
  "documents": {
    "aadhaarDoc": {
      "name": "aadhaar.jpg",
      "dataUrl": "data:image/jpeg;base64,..."
    },
    "panDoc": {
      "name": "pan.jpg",
      "dataUrl": "..."
    },
    "bankProof": {
      "name": "passbook.jpg",
      "dataUrl": "..."
    }
  }
}
```

## Validation rules
- Editable until approval.
- Required for submission: photo, aadhaarDoc, panDoc, bankProof.

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
      6,
      7
    ],
    "completionPercentage": 100,
    "totalSteps": 7,
    "canSubmit": true,
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
curl -s -X POST http://localhost:5000/api/app/profile/documents \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"photo":"data:image/jpeg;base64,...","documents":{"aadhaarDoc":{"name":"aadhaar.jpg","dataUrl":"data:image/jpeg;base64,..."},"panDoc":{"name":"pan.jpg","dataUrl":"..."},"bankProof":{"name":"passbook.jpg","dataUrl":"..."}}}'
```

## Notes
- Prefer per-file uploads via POST /profile/document for large images.
