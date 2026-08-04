==================================================
COMPANY INFO
==================================================

Endpoint
GET /company

Purpose
Get company profile and policies.

Authentication
Yes

Headers
Authorization: Bearer <jwt_token>

Request Parameters
None

Sample Request
None

Success Response
Status Code
200 OK

Response Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| success | Boolean | API Status |
| data | Object | Company Info |

Sample Response
```json
{
  "success": true,
  "data": {
    "id": 1,
    "legalName": "Zenia Technologies",
    "logo": "https://..."
  }
}
```

Error Responses
401
500

Sample Error JSON
```json
{
  "success": false,
  "error": "Unauthorized"
}
```
