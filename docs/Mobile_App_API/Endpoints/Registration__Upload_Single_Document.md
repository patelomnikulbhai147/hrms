# Upload Single Document

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/document` |
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
  "type": "aadhaar",
  "name": "aadhaar.jpg",
  "dataUrl": "data:image/jpeg;base64,..."
}
```

## Validation rules
- `type` is required: aadhaar | pan | photo | signature | passbook | degree | experience | other.
- `dataUrl` (base64) is required.

## Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "uploaded": "aadhaarDoc",
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
**400 TYPE_REQUIRED**
```json
{
  "success": false,
  "message": "Document type is required.",
  "data": null,
  "errors": [
    {
      "code": "TYPE_REQUIRED",
      "message": "Document type is required."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

**400 CONTENT_REQUIRED**
```json
{
  "success": false,
  "message": "Document content is required.",
  "data": null,
  "errors": [
    {
      "code": "CONTENT_REQUIRED",
      "message": "Document content is required."
    }
  ],
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

## HTTP status codes
- `200 OK`
- `400`

## cURL
```bash
curl -s -X POST http://localhost:5000/api/app/profile/document \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"type":"aadhaar","name":"aadhaar.jpg","dataUrl":"data:image/jpeg;base64,..."}'
```

## Notes
- `photo` is stored as the profile photo; others are kept under their document key.
