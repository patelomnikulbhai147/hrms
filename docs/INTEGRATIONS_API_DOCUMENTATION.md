# ZeniaHR Enterprise Integration Hub — API Documentation

This document provides technical documentation for all Integration Hub REST APIs, OAuth endpoints, Webhooks, and API Key management endpoints.

---

## Architecture Overview

All Integration Hub endpoints enforce multi-tenant isolation, RBAC permissions, and server-side secret encryption (`AES-256-GCM`). Secrets (OAuth client secrets, access tokens, refresh tokens, API keys, webhook secrets) are **never returned to the client**.

Authentication Header: `Authorization: Bearer <JWT_TOKEN>`

---

## 1. List Integrations

### `GET /api/integrations`
Retrieves connection status and synchronization summary for all available integrations for the authenticated company workspace.

- **Permissions**: `protect` (Company Head / HR Admin / Super Admin)
- **Query Parameters**:
  - `companyId` *(optional for Super Admin)*: Target company ID.

#### Response `200 OK`
```json
[
  {
    "id": "google_workspace",
    "name": "Google Workspace",
    "category": "Productivity & Directory",
    "status": "Not Configured",
    "authType": "OAuth2",
    "accountEmail": null,
    "lastSyncAt": null,
    "lastSyncStatus": null,
    "syncEnabled": true,
    "syncFrequency": "Hourly",
    "syncDirection": "Bidirectional"
  },
  {
    "id": "slack",
    "name": "Slack",
    "category": "Communication",
    "status": "Connected",
    "authType": "OAuth2",
    "accountEmail": "ZeniaHR Workspace (T01ABCDEF)",
    "lastSyncAt": "2026-08-13T10:30:00.000Z",
    "lastSyncStatus": "SUCCESS"
  }
]
```

---

## 2. Integration Details & Settings

### `GET /api/integrations/:provider`
Fetches detailed state, masked credentials, recent sync logs, field mappings, and audit logs for a specific provider.

- **Path Parameters**: `:provider` (`google_workspace`, `slack`, `sap`, `tally`)

#### Response `200 OK`
```json
{
  "id": "sap",
  "name": "SAP ERP",
  "status": "Connected",
  "syncEnabled": true,
  "syncFrequency": "Hourly",
  "credentialsMasked": {
    "baseUrl": "https://sap.company.com/sap/opu/odata/sap/",
    "username": "************USER",
    "environment": "Production"
  },
  "syncLogs": [],
  "auditLogs": []
}
```

---

## 3. OAuth Flow Endpoints

### `GET /api/integrations/:provider/oauth/start`
Initiates OAuth 2.0 authorization flow for Google Workspace or Slack.

#### Response `200 OK`
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&response_type=code"
}
```

### `GET /api/integrations/:provider/oauth/callback`
Processes OAuth authorization code callback, exchanges for tokens, encrypts tokens at rest, and establishes connection.

---

## 4. Connection Configuration

### `POST /api/integrations/:provider/connect`
Configures API/HTTP connections for SAP ERP, Tally Prime, or custom integrations.

#### Request Body (SAP Example)
```json
{
  "baseUrl": "https://sap.company.com/sap/opu/odata/sap/",
  "client": "100",
  "username": "SAP_SERVICE_USER",
  "password": "SecretPassword123",
  "environment": "Production"
}
```

#### Response `200 OK`
```json
{
  "connection": {
    "id": 1,
    "provider": "sap",
    "status": "Connected"
  },
  "testResult": {
    "success": true,
    "message": "Successfully connected to SAP ERP instance at https://sap.company.com."
  }
}
```

---

## 5. Live Connection Test

### `POST /api/integrations/:provider/test`
Performs a live real-time authentication ping test against the provider's API.

#### Response `200 OK`
```json
{
  "success": true,
  "configured": true,
  "message": "Slack connection active for workspace \"ZeniaHR\" (Bot: @zenia_bot)."
}
```

---

## 6. Trigger Immediate Sync

### `POST /api/integrations/:provider/sync`
Triggers an immediate asynchronous sync execution run.

#### Response `200 OK`
```json
{
  "message": "Sync completed for sap",
  "syncLog": {
    "id": 42,
    "provider": "sap",
    "status": "SUCCESS",
    "recordsProcessed": 15,
    "recordsCreated": 2,
    "recordsUpdated": 13,
    "recordsFailed": 0
  }
}
```

---

## 7. Disconnect Integration

### `DELETE /api/integrations/:provider`
Disconnects the integration, revokes tokens, and clears stored credentials.

---

## 8. Managed API Keys Endpoints

### `GET /api/integrations/api-keys`
Lists all generated API keys for the company (returns masked secrets).

### `POST /api/integrations/api-keys`
Generates a new secure API key (`zen_live_<hex32>`). **The unmasked key is returned ONCE ONLY**.

#### Request Body
```json
{
  "name": "Payroll Automation Bot",
  "scopes": ["read:employees", "write:attendance", "read:payroll"],
  "rateLimit": 5000
}
```

#### Response `201 Created`
```json
{
  "id": 5,
  "name": "Payroll Automation Bot",
  "rawApiKey": "zen_live_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a",
  "keyMask": "zen_live_9f8e7d6c...7b6a",
  "scopes": ["read:employees", "write:attendance", "read:payroll"],
  "status": "ACTIVE",
  "rateLimit": 5000
}
```

### `DELETE /api/integrations/api-keys/:keyId`
Revokes an API key.

---

## 9. Inbound Webhooks Endpoint

### `POST /api/integrations/webhooks/:provider`
Public/authenticated webhook endpoint. Validates HMAC SHA-256 signatures, checks idempotency using `eventId`, and logs webhook event.
