==================================================
DASHBOARD
==================================================

Endpoint
GET /dashboard

Purpose
Fetch dashboard widgets and summary data.

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
| data | Object | Dashboard Widgets |

Sample Response
```json
{
  "success": true,
  "data": {
    "attendanceSummary": {
      "present": 45,
      "absent": 5,
      "leave": 2
    },
    "upcomingBirthdays": [],
    "recentAnnouncements": []
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
