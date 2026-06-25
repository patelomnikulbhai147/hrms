# Save Education

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/education` |
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
  "education": [
    {
      "degree": "B.Tech",
      "institution": "GTU",
      "year": "2020",
      "grade": "8.2 CGPA"
    }
  ]
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
    "currentStep": 6,
    "completedSteps": [
      1,
      2,
      3,
      4,
      5
    ],
    "completionPercentage": 71,
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
curl -s -X POST http://localhost:5000/api/app/profile/education \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"education":[{"degree":"B.Tech","institution":"GTU","year":"2020","grade":"8.2 CGPA"}]}'
```

## Notes
- Standard response envelope: { success, message, data, errors, timestamp }.
