==================================================
NOTIFICATIONS
==================================================

Endpoint
GET /notifications

Purpose
Fetch user notifications.

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
| data | Array | List of notifications |

Sample Response
```json
{
  "success": true,
  "data": [
    {
      "id": 101,
      "title": "Leave Approved",
      "body": "Your sick leave was approved.",
      "read": false,
      "createdAt": "2026-08-04T10:00:00Z"
    }
  ]
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
