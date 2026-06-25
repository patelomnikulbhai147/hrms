# Save Address

**Group:** Registration

| | |
|---|---|
| **Endpoint** | `POST /api/app/profile/address` |
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
  "present": {
    "line1": "12 MG Road",
    "line2": "",
    "area": "Navrangpura",
    "landmark": "Near Park",
    "city": "Ahmedabad",
    "district": "Ahmedabad",
    "state": "Gujarat",
    "country": "India",
    "pincode": "380009"
  },
  "sameAsPresent": true
}
```

## Validation rules
- Editable until approval.
- Set `sameAsPresent:true` to copy present → permanent.

## Success response (200)
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "saved": true,
    "currentStep": 3,
    "completedSteps": [
      1,
      2
    ],
    "completionPercentage": 29,
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
curl -s -X POST http://localhost:5000/api/app/profile/address \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <accessToken>' \
  -d '{"present":{"line1":"12 MG Road","line2":"","area":"Navrangpura","landmark":"Near Park","city":"Ahmedabad","district":"Ahmedabad","state":"Gujarat","country":"India","pincode":"380009"},"sameAsPresent":true}'
```

## Notes
- Structured address is composed into `presentAddress` / `permanentAddress`.
