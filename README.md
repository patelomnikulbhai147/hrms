# CoreHR – Enterprise HRMS & Payroll SaaS

## Overview

CoreHR is a multi-tenant SaaS Human Resource Management System designed to handle enterprise-level workforce operations. Built on a modern full-stack architecture, it provides a centralized platform for managing multiple companies, branches, and employees with granular access controls and real-time data synchronization. 

Key modules include:
* **Company Management**: Onboard and manage multiple parent companies as individual tenants.
* **Branch Management**: Hierarchical branch structuring with dedicated branch-level scopes.
* **Employee Management**: Comprehensive digital employee records (Workforce Management).
* **Payroll Management**: Automated payroll processing, deductions (PF/ESIC), and dashboard statistics.
* **Attendance Management**: Daily attendance tracking and timesheet management.
* **Leave Management**: Leave requests, approvals, and workflow routing.
* **User & Role Management (RBAC)**: Secure access control based on specific organizational roles.
* **Reports & Analytics**: High-level statistical dashboards and actionable insights.
* **Subscription Management**: Billing, invoicing, and SaaS plan monitoring for tenant companies.
* **Document Management**: Secure digital storage for employee compliance and corporate documents.
* **Notifications**: System-wide alerting and broadcast messaging.
* **Offboarding Workflow**: Formal archiving and soft-delete processes to preserve historical integrity.

---

## Technology Stack

**Frontend Architecture**
* **Framework**: React 19 (Hooks, Context API)
* **Language**: TypeScript
* **Build Tool**: Vite
* **UI Framework**: Tailwind CSS v4
* **Icons & Visuals**: Lucide React, Recharts (for Dashboard analytics)
* **State Management**: React Hooks (useState, useMemo, useEffect, Context API)

**Backend Architecture**
* **Framework**: Node.js with Express.js
* **Database**: MySQL (Relational Database)
* **ORM**: Prisma (schema management and typed database client)
* **Authentication**: JWT (JSON Web Tokens) & `bcryptjs`
* **File Storage**: Relational BLOB storage (Base64) / Path-based file persistence

---

## Project Structure

```text
enterprise-hrms-crm-application/
│
├── backend/                        # Node.js + Express Backend
│   ├── prisma/
│   │   ├── migrations/             # Database migration history
│   │   └──            # Core database schema models
│   ├── scripts/                    # Utility and migration scripts
│   ├── src/
│   │   ├── controllers/            # Business logic (e.g., employeeController, payrollController)
│   │   ├── middleware/             # authMiddleware, rbacMiddleware
│   │   ├── routes/                 # API route definitions
│   │   └── services/               # Reusable background services
│   ├── .env                        # Backend environment configurations
│   ├── package.json
│   └── server.js                   # Application entry point
│
├── src/                            # React Frontend
│   ├── api/                        # API client service layer (apiClient.ts)
│   ├── components/                 # Reusable UI components
│   │   ├── common/                 # Modals, Error boundaries
│   │   ├── layout/                 # Sidebar, Topbar
│   │   └── ui/                     # Badges, Buttons, Tables, Cards
│   ├── context/                    # React Context (PermissionContext)
│   ├── data/                       # Application statics and mock parsers
│   ├── pages/                      # Main route pages (Dashboard, Employees, Payroll, etc.)
│   ├── types/                      # TypeScript definitions
│   └── utils/                      # Helper utilities (payroll.ts, deduplication.ts)
│
├── package.json                    # Frontend dependencies
├── vite.config.ts                  # Vite build configuration
└── index.html                      # HTML entry point
```

---

## Database Structure

The MySQL database is managed via Prisma and includes the following active tables:

* `User`: Application users, credentials, role mapping, and session data.
* `Company`: Parent tenant organizations, billing details, and SaaS configurations.
* `Branch`: Child offices belonging to a Company.
* `Employee`: Master personnel records linked to Companies/Branches.
* `Payroll`: Monthly salary processing records and payment statuses.
* `Attendance`: Daily timesheets and clock-in/out records.
* `LeaveRequest`: Time-off applications and approval trails.
* `Notification`: System alerts and broadcasts.
* `SubscriptionPlan`: SaaS tier configurations (e.g., Starter, Pro, Enterprise).
* `PaymentRecord`: Billing invoices and subscription payment histories.
* `Document`: Compliance and enterprise document links.
* `AuditLog`: System-wide security tracking for CREATES, UPDATES, and DELETES.

---

## Features

* **Multi-Tenant SaaS**: Completely isolated data per parent company.
* **Real-time Payroll Synchronization**: Automatic payroll profile generation and calculation engine when employees are onboarded.
* **Role-Based Access Control (RBAC)**: Secure API-level authorization preventing vertical and horizontal privilege escalation.
* **Soft-Delete Architecture**: Formal offboarding and archiving replacing hard-deletes to maintain historical records.
* **Bulk Import Capability**: CSV parser for mass onboarding of employee workforces.
* **Dynamic Branch Allocation**: Scale organizations limitlessly into multiple localized offices.

---

## Installation

### Prerequisites
* Node.js (v18+)
* MySQL server (local, e.g. Laragon/phpMyAdmin, or AWS RDS for MySQL)

### 1. Database Setup
1. Create a blank MySQL database (e.g. `corehrms`).
2. Update the `.env` file in the `backend/` directory with your `DATABASE_URL`.

### 2. Backend Initialization
```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run dev
```
*(The backend will start on port 5000)*

### 3. Frontend Initialization
Open a new terminal session in the root folder:
```bash
npm install
npm run dev
```
*(The frontend will start on your local Vite port, usually 5173)*

---

## Environment Variables

**Backend (`backend/.env`)**
```env
# Server Port Configuration
PORT=5000

# MySQL Connection String
DATABASE_URL="mysql://user:password@localhost:3306/corehrms"

# JWT Security
JWT_SECRET="your_secure_random_string_here"
JWT_EXPIRES_IN="24h"
```

---

## API Overview

The backend exposes a RESTful API structured by module. All endpoints require a Bearer JWT token in the `Authorization` header.

* `/api/auth` - Login, Session validation.
* `/api/companies` - Tenant management, SaaS configuration.
* `/api/branches` - Location management.
* `/api/employees` - Workforce CRUD operations and Bulk Imports.
* `/api/payroll` - Automated salary computations and syncing.
* `/api/attendance` - Timesheet tracking.
* `/api/leaves` - Request handling.
* `/api/users` - RBAC administration.

---

## Roles & Permissions

* **Super Admin**: Highest privilege. Oversees all SaaS tenants, handles global subscription plans, billing, and global settings.
* **Company Head**: Executive level access. Sees all data, branches, and analytics specifically isolated to their own company.
* **HR**: Operational access to Workforce Management, Leave Approvals, Attendance, and Employee Offboarding for their assigned scopes.
* **Finance**: Operational access to Payroll processing, Invoice management, and Company Subscription billing.
* **Employee**: Self-service portal access to view personal profile, attendance history, apply for leaves, and download payslips.

---

## Database Relationships

**The Hierarchy:**
`Company` ⭢ `Branch` ⭢ `Employee`

1. **Company**: The top-level tenant. 
2. **Branch**: Belongs to exactly 1 `Company`.
3. **Employee**: 
   - MUST belong to 1 `Company`.
   - CAN optionally belong to a specific `Branch` within that company.
   - All child tables (`Payroll`, `Attendance`, `LeaveRequest`) trace back via `employeeId` and `companyId` simultaneously for rapid tenant scoping.

---

## Troubleshooting

* **Missing Data on Dashboard**: The system uses soft-deletes (`status: 'Archived'`). If a record is missing, ensure it wasn't archived. Check the "Archived" tabs.
* **Prisma Client Initialization Error**: Run `npx prisma generate` inside the `backend` folder to build the Prisma client types for your environment.
* **Payroll Values showing 0**: Ensure employees are marked as "Active" with a `salary > 0`. The background engine auto-syncs active employees seamlessly.

---

## Version Information
**CoreHR Version**: 1.0.0 (Production Stable)
**React Version**: 19.x
**Node Version**: 22.x compatibility verified

---

## Future Enhancements
* Automated Email / SMS Notifications.
* Advanced biometric hardware integration for Attendance.
* Self-hosted storage configurations (AWS S3) for document management.
* Mobile App API provisioning.
