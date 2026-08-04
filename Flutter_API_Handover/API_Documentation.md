# API Documentation Summary

| API | Method | URL | Auth Required |
|-----|--------|-----|---------------|
| Admin Login | POST | /auth/login | No |
| Admin Verify | POST | /auth/verify-otp | No |
| Admin Refresh | POST | /auth/refresh | Yes |
| Admin Logout | POST | /auth/logout | Yes |
| Admin Logout All | POST | /auth/logout-all | Yes |
| Employee Login | POST | /employee/login | No |
| Employee Verify | POST | /employee/verify-otp | No |
| Employee Logout | POST | /employee/logout | Yes |
| Employee Logout All | POST | /employee/logout-all | Yes |
| Dashboard | GET | /dashboard | Yes |
| Profile (Get) | GET | /profile | Yes |
| Profile (Update) | PUT | /profile | Yes |
| Company | GET | /company | Yes |
| Notifications | GET | /notifications | Yes |
| Employees List | GET | /employees | Yes |
| Employees Search | GET | /employees/search | Yes |
| Employee Detail | GET | /employees/{id} | Yes |
