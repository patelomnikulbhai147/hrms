import { Company } from '@/data/mockData';
import { authStorage } from '@/utils/authStorage';

// API base URL.
//  - Local dev: falls back to the local backend.
//  - Production: set VITE_API_BASE_URL at build time. With the nginx reverse
//    proxy (see deploy/frontend/nginx-hrms.conf) this is just "/api", so the
//    browser only ever talks to the frontend host and there are no CORS issues.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Live Super Admin KPI counts returned by GET /api/statistics/super-admin.
// Single source of truth — every field is computed directly from MySQL.
export interface SuperAdminStats {
  totalCompanies: number;           // Total Companies / Total Scoped Tenants / Directory
  activeCompanies: number;          // Active Companies KPI
  suspendedAccounts: number;        // Suspended Accounts KPI
  archivedCompanies: number;
  offboardedCompanies: number;      // Offboarded Companies KPI
  activeSubscriptions: number;      // Active Subscriptions KPI
  totalBranches: number;            // Total Branches KPI
  activeBranches: number;
  suspendedBranches: number;
  archivedBranches: number;
  deactivatedCompanies: number;     // Companies with status Suspended/Inactive/Deactivated
  deactivatedBranches: number;      // Branches with status Suspended/Inactive/Deactivated
  totalEmployees: number;           // Combined Employees KPI (COUNT(*))
  activeStaff: number;              // currently-employed headcount
  totalStaff: number;               // back-compat alias of activeStaff
  combinedEmployees: number;        // alias of totalEmployees
  monthlyRevenue: number;           // Monthly Revenue (MRR) KPI
  generatedAt: string;
}

const getHeaders = () => {
  const token = authStorage.get('hrms_jwt_token');
  const workspaceId = localStorage.getItem('hrms_active_company_id');
  // The active workspace KIND ('company' | 'branch') lets the backend apply strict
  // branch scope when a company-level user selects a specific branch in the
  // top-right scope selector (company/branch ids share one space).
  const workspaceKind = localStorage.getItem('hrms_active_workspace_kind');
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
    ...(workspaceKind ? { 'x-workspace-kind': workspaceKind } : {})
  };
};

// How long to wait before treating a request as timed-out. A dropped/closed
// socket otherwise leaves the promise hanging forever; this surfaces it as a
// real "timeout" error the UI can explain.
const REQUEST_TIMEOUT_MS = 60000;

async function apiFetch(url: string, options?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // An authenticated request counts as user activity (keeps the session alive).
  const _hadToken = !!authStorage.get('hrms_jwt_token');
  if (_hadToken) authStorage.markActivity();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      // Prefer the backend's real message; it now sends specific causes
      // (duplicate email, validation, not-found, Error ID, etc.).
      let msg = '';
      let code: string | undefined;
      try {
        const errorData = await res.json();
        msg = errorData.error || errorData.message || '';
        code = errorData.code;
      } catch (e) {
        msg = res.statusText || '';
      }
      // Classify by HTTP status so callers/UI can react and the message is
      // never an empty/opaque string.
      if (!msg) {
        if (res.status === 401) msg = 'Your session has expired. Please sign in again.';
        else if (res.status === 403) msg = 'You do not have permission to perform this action.';
        else if (res.status === 404) msg = 'The requested record was not found.';
        else if (res.status === 503) msg = 'The database is currently unreachable. Please try again shortly.';
        else if (res.status >= 500) msg = 'The server encountered an error. Please try again.';
        else msg = `Request failed (HTTP ${res.status}).`;
      }
      // An expired/invalid token on an AUTHENTICATED request ends the session
      // everywhere. (A 401 during login itself has no token, so it won't fire.)
      if (res.status === 401 && _hadToken) {
        authStorage.clearSession();
        authStorage.broadcastLogout('expired');
        try { window.dispatchEvent(new CustomEvent('hrms:unauthorized')); } catch (_) { /* ignore */ }
      }
      const err: any = new Error(msg);
      err.status = res.status;
      err.code = code;
      throw err;
    }
    return await res.json();
  } catch (err: any) {
    // A genuine connectivity / runtime transport failure — NOT a server-sent
    // error. These get tagged so the UI can say "server unavailable" only when
    // it's actually true.
    if (err?.name === 'AbortError') {
      const e: any = new Error('The request timed out. The server took too long to respond.');
      e.isTimeout = true;
      e.isNetworkError = true;
      console.error('API Client Timeout:', url);
      throw e;
    }
    if (err instanceof TypeError) {
      // fetch() rejects with a TypeError on DNS/connection/CORS/socket failure.
      const e: any = new Error('Cannot reach the server. Please check your connection and try again.');
      e.isNetworkError = true;
      console.error('API Client Network Error:', url, err.message);
      throw e;
    }
    console.error('API Client Error:', err);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  auth: {
    login: async (credentials: any) => {
      return await apiFetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(credentials)
      });
    },
    getMe: async () => {
      return await apiFetch(`${BASE_URL}/auth/me`, {
        headers: getHeaders()
      });
    },
    // Self-service: change own password (verifies current password server-side).
    changePassword: async (data: { currentPassword: string; newPassword: string }) => {
      return await apiFetch(`${BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    },
    // Step 1 — request an OTP to the registered email.
    forgotPassword: async (data: { email: string }) => {
      return await apiFetch(`${BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    },
    // Step 2 — verify the OTP, receive a short-lived reset token.
    verifyOtp: async (data: { email: string; otp: string }) => {
      return await apiFetch(`${BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    },
    // Step 3 — set the new password using the reset token.
    resetPassword: async (data: { resetToken: string; newPassword: string }) => {
      return await apiFetch(`${BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    }
  },
  
  companies: {
    getAll: async () => {
      return await apiFetch(`${BASE_URL}/companies`, { headers: getHeaders() });
    },
    create: async (data: Partial<Company>) => {
      return await apiFetch(`${BASE_URL}/companies`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    },
    update: async (id: string, data: Partial<Company>) => {
      return await apiFetch(`${BASE_URL}/companies/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    },
    // Permission-gated branding update — usable by Company Admin / HR (if granted),
    // not just Super Admin. Persists branding to the DB and writes an audit entry.
    updateBranding: async (id: string, data: any) => {
      return await apiFetch(`${BASE_URL}/companies/${id}/branding`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    },
    archive: async (id: string) => {
      return await apiFetch(`${BASE_URL}/companies/${id}/archive`, {
        method: 'PUT',
        headers: getHeaders()
      });
    },
    hardDelete: async (id: string) => {
      return await apiFetch(`${BASE_URL}/companies/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
    },
    getDependencies: async (id: string) => {
      return await apiFetch(`${BASE_URL}/companies/${id}/dependencies`, {
        headers: getHeaders()
      });
    },
    getExportData: async () => {
      return await apiFetch(`${BASE_URL}/companies/export`, {
        headers: getHeaders()
      });
    }
  },

  branches: {
    getAll: async () => {
      return await apiFetch(`${BASE_URL}/branches`, { headers: getHeaders() });
    },
    create: async (data: any) => {
      return await apiFetch(`${BASE_URL}/branches`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    },
    update: async (id: string, data: any) => {
      return await apiFetch(`${BASE_URL}/branches/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    },
    archive: async (id: string) => {
      // Company controller handles branch archiving securely too
      return await apiFetch(`${BASE_URL}/companies/${id}/archive`, {
        method: 'PUT',
        headers: getHeaders()
      });
    },
    hardDelete: async (id: string) => {
      // Company controller handles branch deletion checks
      return await apiFetch(`${BASE_URL}/companies/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
    }
  },

  employees: {
    // Default returns ACTIVE employees only (offboarded excluded server-side).
    // Pass '?include=all' for the Offboarding/Archive/Reports/History views.
    getAll: async (query: string = '') => {
      return await apiFetch(`${BASE_URL}/employees${query}`, { headers: getHeaders() });
    },
    create: async (data: any) => {
      return await apiFetch(`${BASE_URL}/employees`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    },
    update: async (id: string, data: any) => {
      return await apiFetch(`${BASE_URL}/employees/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    },
    bulkCreate: async (employees: any[]) => {
      return await apiFetch(`${BASE_URL}/employees/bulk`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ employees })
      });
    },
    archive: async (id: string) => {
      return await apiFetch(`${BASE_URL}/employees/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
    }
  },
  
  audit: {
    getAll: async (query: string = '') => { return await apiFetch(`${BASE_URL}/audit${query}`, { headers: getHeaders() }); },
  },
  users: {
    getAll: async () => {
      return await apiFetch(`${BASE_URL}/users`, { headers: getHeaders() });
    },
    create: async (data: any) => {
      return await apiFetch(`${BASE_URL}/users`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    },
    update: async (id: string, data: any) => {
      return await apiFetch(`${BASE_URL}/users/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    },
    resetPassword: async (id: string, newPassword: string) => {
      return await apiFetch(`${BASE_URL}/users/${id}/reset-password`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ newPassword })
      });
    },
    delete: async (id: string) => {
      return await apiFetch(`${BASE_URL}/users/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
    },
    getAuditLogs: async () => {
      return await apiFetch(`${BASE_URL}/users/audit`, { headers: getHeaders() });
    },
    // Users the caller may manage permissions for (Super Admin all; Company Admin
    // own company; HR if granted — branch only). Company-isolated on the backend.
    getManageable: async () => { return await apiFetch(`${BASE_URL}/users/manageable`, { headers: getHeaders() }); },
    updatePermissions: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/users/${id}/permissions`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    // Server-side search for assignable management users (scoped to caller's
    // permissions). Never loads the whole user table — pass a search term.
    getAssignable: async (opts?: { search?: string; companyId?: any; branchId?: any; limit?: number }) => {
      const qs = new URLSearchParams();
      if (opts?.search) qs.set('search', String(opts.search));
      if (opts?.companyId) qs.set('companyId', String(opts.companyId));
      if (opts?.branchId) qs.set('branchId', String(opts.branchId));
      if (opts?.limit) qs.set('limit', String(opts.limit));
      const q = qs.toString();
      return await apiFetch(`${BASE_URL}/users/assignable${q ? `?${q}` : ''}`, { headers: getHeaders() });
    }
  },

  leaves: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/leaves`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/leaves`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/leaves/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/leaves/${id}`, { method: 'DELETE', headers: getHeaders() }); }
  },

  leaveBalances: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/leave-balances`, { headers: getHeaders() }); },
    accrue: async (data: { throughMonth?: number; year?: number; companyId?: any }) => { return await apiFetch(`${BASE_URL}/leave-balances/accrue`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (employeeId: any, data: any) => { return await apiFetch(`${BASE_URL}/leave-balances/${employeeId}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
  },

  leaveCredit: {
    get: async () => { return await apiFetch(`${BASE_URL}/leave-credit`, { headers: getHeaders() }); },
    update: async (data: any) => { return await apiFetch(`${BASE_URL}/leave-credit`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
  },

  // Manual leave administration (grant / deduct / reset / transfer / carry-forward + audit)
  leaveAdmin: {
    grant: async (data: any) => { return await apiFetch(`${BASE_URL}/leave-admin/grant`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    deduct: async (data: any) => { return await apiFetch(`${BASE_URL}/leave-admin/deduct`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    reset: async (data: any) => { return await apiFetch(`${BASE_URL}/leave-admin/reset`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    transfer: async (data: any) => { return await apiFetch(`${BASE_URL}/leave-admin/transfer`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    carryForward: async (data: any) => { return await apiFetch(`${BASE_URL}/leave-admin/carry-forward`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    audit: async () => { return await apiFetch(`${BASE_URL}/leave-admin/audit`, { headers: getHeaders() }); },
  },

  // Attendance device registry (Phase 1 — device management only, no biometric sync)
  attendanceDevices: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/attendance-devices`, { headers: getHeaders() }); },
    getOne: async (id: any) => { return await apiFetch(`${BASE_URL}/attendance-devices/${id}`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/attendance-devices`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/attendance-devices/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    remove: async (id: any) => { return await apiFetch(`${BASE_URL}/attendance-devices/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    // Phase 5 — read-only diagnostics
    testConnection: async (id: any) => { return await apiFetch(`${BASE_URL}/attendance-devices/${id}/test-connection`, { method: 'POST', headers: getHeaders() }); },
    discover: async (id: any) => { return await apiFetch(`${BASE_URL}/attendance-devices/${id}/discover`, { method: 'POST', headers: getHeaders() }); },
    // Phase 6 — raw device push logs (Live Device Monitor)
    pushLogs: async () => { return await apiFetch(`${BASE_URL}/attendance-devices/push-logs`, { headers: getHeaders() }); },
  },

  // Attendance vendor registry — configurable catalog (E-TimeOffice, eSSL, …).
  // New vendors are added as data (Super Admin), so no code change is required.
  attendanceVendors: {
    getAll: async (all?: boolean) => { return await apiFetch(`${BASE_URL}/attendance-vendors${all ? '?all=1' : ''}`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/attendance-vendors`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/attendance-vendors/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    remove: async (id: any) => { return await apiFetch(`${BASE_URL}/attendance-vendors/${id}`, { method: 'DELETE', headers: getHeaders() }); },
  },

  // Bonus Management (Phase 1 — Bonus Configuration). Separate bonus
  // transaction system; never stored on the employee record.
  bonus: {
    configs: {
      getAll: async () => { return await apiFetch(`${BASE_URL}/bonus/configurations`, { headers: getHeaders() }); },
      create: async (data: any) => { return await apiFetch(`${BASE_URL}/bonus/configurations`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
      update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/bonus/configurations/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
      remove: async (id: any) => { return await apiFetch(`${BASE_URL}/bonus/configurations/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    },
    cycles: {
      getAll: async () => { return await apiFetch(`${BASE_URL}/bonus/cycles`, { headers: getHeaders() }); },
      create: async (data: any) => { return await apiFetch(`${BASE_URL}/bonus/cycles`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
      lines: async (id: any) => { return await apiFetch(`${BASE_URL}/bonus/cycles/${id}/lines`, { headers: getHeaders() }); },
      generate: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/bonus/cycles/${id}/generate`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
      override: async (id: any, employeeId: any, data: any) => { return await apiFetch(`${BASE_URL}/bonus/cycles/${id}/line/${employeeId}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
      approve: async (id: any) => { return await apiFetch(`${BASE_URL}/bonus/cycles/${id}/approve`, { method: 'POST', headers: getHeaders() }); },
      release: async (id: any, data: any = {}) => { return await apiFetch(`${BASE_URL}/bonus/cycles/${id}/release`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
      cancel: async (id: any) => { return await apiFetch(`${BASE_URL}/bonus/cycles/${id}/cancel`, { method: 'POST', headers: getHeaders() }); },
    },
    payments: async () => { return await apiFetch(`${BASE_URL}/bonus/payments`, { headers: getHeaders() }); },
    mine: async () => { return await apiFetch(`${BASE_URL}/bonus/my`, { headers: getHeaders() }); },
    dashboard: async () => { return await apiFetch(`${BASE_URL}/bonus/dashboard`, { headers: getHeaders() }); },
  },

  // Per-employee bonus ledger — the new bonus model (Employee + Payroll driven).
  // One-time festival/performance bonuses + bonus history per employee.
  employeeBonuses: {
    list: async (query: string = '') => { return await apiFetch(`${BASE_URL}/employee-bonuses${query}`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/employee-bonuses`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/employee-bonuses/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    remove: async (id: any, hard = false) => { return await apiFetch(`${BASE_URL}/employee-bonuses/${id}${hard ? '?hard=1' : ''}`, { method: 'DELETE', headers: getHeaders() }); },
  },

  // Biometric Code mappings (Phase 4 — mapping only, no attendance sync).
  // Maps the attendance-machine code to an employee without touching Employee IDs.
  biometricMappings: {
    list: async () => { return await apiFetch(`${BASE_URL}/biometric-mappings`, { headers: getHeaders() }); },
    setOne: async (id: any, biometricCode: string) => { return await apiFetch(`${BASE_URL}/biometric-mappings/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ biometricCode }) }); },
    bulk: async (rows: any[], companyId?: any) => { return await apiFetch(`${BASE_URL}/biometric-mappings/bulk`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ rows, companyId }) }); },
  },

  // Government Compliance Reports — live statutory reports from DB.
  complianceReports: {
    catalog: async () => { return await apiFetch(`${BASE_URL}/compliance-reports/catalog`, { headers: getHeaders() }); },
    generate: async (data: any) => { return await apiFetch(`${BASE_URL}/compliance-reports/generate`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    // Sample preview using the VISHV ENTERPRISE demo company (never touches real data).
    preview: async (reportKey: string) => { return await apiFetch(`${BASE_URL}/compliance-reports/preview`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ reportKey }) }); },
    logDownload: async (data: any) => { return await apiFetch(`${BASE_URL}/compliance-reports/log-download`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    audit: async () => { return await apiFetch(`${BASE_URL}/compliance-reports/audit`, { headers: getHeaders() }); },
  },

  // Country / State / City masters for the creatable location dropdowns.
  // getAll returns { states, countries, citiesByState, cities? } — canonical lists
  // live statically on the client; this supplies custom (DB-saved) additions.
  locationMasters: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/location-masters`, { headers: getHeaders() }); },
    add: async (type: 'city' | 'state', name: string) => { return await apiFetch(`${BASE_URL}/location-masters`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ type, name }) }); },
    // Custom city is stored linked to its state so it only resurfaces for that state.
    addCity: async (state: string, name: string) => { return await apiFetch(`${BASE_URL}/location-masters/city`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ state, name }) }); },
    // Custom country (nationality) — Super Admin only (enforced server-side).
    addCountry: async (name: string) => { return await apiFetch(`${BASE_URL}/location-masters/country`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ name }) }); },
  },

  // Employee Nominees (dedicated tables — never stored on the employee row)
  nominees: {
    list: async (employeeId: string | number) => { return await apiFetch(`${BASE_URL}/nominees?employeeId=${encodeURIComponent(String(employeeId))}`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/nominees`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    bulkCreate: async (employeeId: string | number, nominees: any[]) => { return await apiFetch(`${BASE_URL}/nominees/bulk`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ employeeId, nominees }) }); },
    update: async (id: string | number, data: any) => { return await apiFetch(`${BASE_URL}/nominees/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    remove: async (id: string | number) => { return await apiFetch(`${BASE_URL}/nominees/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    archive: async (id: string | number) => { return await apiFetch(`${BASE_URL}/nominees/${id}/archive`, { method: 'POST', headers: getHeaders() }); },
    addDocument: async (id: string | number, data: any) => { return await apiFetch(`${BASE_URL}/nominees/${id}/documents`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    getDocument: async (docId: string | number) => { return await apiFetch(`${BASE_URL}/nominees/documents/${docId}`, { headers: getHeaders() }); },
    removeDocument: async (docId: string | number) => { return await apiFetch(`${BASE_URL}/nominees/documents/${docId}`, { method: 'DELETE', headers: getHeaders() }); },
    audit: async (employeeId: string | number) => { return await apiFetch(`${BASE_URL}/nominees/audit?employeeId=${encodeURIComponent(String(employeeId))}`, { headers: getHeaders() }); },
  },

  // IFSC → bank/branch lookup (auto-fills bank details from the IFSC code)
  ifsc: {
    lookup: async (code: string) => { return await apiFetch(`${BASE_URL}/ifsc/${encodeURIComponent(code)}`, { headers: getHeaders() }); },
  },

  // Task Manager
  tasks: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/tasks`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/tasks`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/tasks/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    remove: async (id: any) => { return await apiFetch(`${BASE_URL}/tasks/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    getComments: async (id: any) => { return await apiFetch(`${BASE_URL}/tasks/${id}/comments`, { headers: getHeaders() }); },
    addComment: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/tasks/${id}/comments`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
  },

  // Tender Information
  tenders: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/tenders`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/tenders`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/tenders/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    remove: async (id: any) => { return await apiFetch(`${BASE_URL}/tenders/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    convert: async (id: any) => { return await apiFetch(`${BASE_URL}/tenders/${id}/convert`, { method: 'POST', headers: getHeaders() }); },
  },
  contracts: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/contracts`, { headers: getHeaders() }); },
    getOne: async (id: any) => { return await apiFetch(`${BASE_URL}/contracts/${id}`, { headers: getHeaders() }); },
    getCost: async (id: any, query: string = '') => { return await apiFetch(`${BASE_URL}/contracts/${id}/cost${query}`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/contracts`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/contracts/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    remove: async (id: any) => { return await apiFetch(`${BASE_URL}/contracts/${id}`, { method: 'DELETE', headers: getHeaders() }); },
  },
  contractSites: {
    getAll: async (query: string = '') => { return await apiFetch(`${BASE_URL}/contract-sites${query}`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/contract-sites`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/contract-sites/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    remove: async (id: any) => { return await apiFetch(`${BASE_URL}/contract-sites/${id}`, { method: 'DELETE', headers: getHeaders() }); },
  },
  deployments: {
    getAll: async (query: string = '') => { return await apiFetch(`${BASE_URL}/deployments${query}`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/deployments`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/deployments/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    remove: async (id: any) => { return await apiFetch(`${BASE_URL}/deployments/${id}`, { method: 'DELETE', headers: getHeaders() }); },
  },

  documents: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/documents`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/documents`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/documents/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/documents/${id}`, { method: 'DELETE', headers: getHeaders() }); }
  },

  statistics: {
    // Live, database-driven Super Admin KPI counts (single source of truth).
    getSuperAdmin: async () => {
      return await apiFetch(`${BASE_URL}/statistics/super-admin`, { headers: getHeaders() });
    }
  },

  plans: {
    getAll: async () => {
      return await apiFetch(`${BASE_URL}/plans`, { headers: getHeaders() });
    },
    update: async (id: string, data: any) => {
      return await apiFetch(`${BASE_URL}/plans/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    }
  },

  payments: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/payments`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/payments`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/payments/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/payments/${id}`, { method: 'DELETE', headers: getHeaders() }); }
  },

  notifications: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/notifications`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/notifications`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/notifications/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/notifications/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    markRead: async (id: any) => { return await apiFetch(`${BASE_URL}/notifications/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ read: true }) }); },
    markAllRead: async () => { return await apiFetch(`${BASE_URL}/notifications/read-all`, { method: 'PUT', headers: getHeaders() }); },
    deleteMany: async (ids: any[]) => { return await apiFetch(`${BASE_URL}/notifications/delete-many`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ ids }) }); },
    clearAll: async () => { return await apiFetch(`${BASE_URL}/notifications/clear-all`, { method: 'DELETE', headers: getHeaders() }); }
  },

  payroll: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/payroll`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/payroll`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/payroll/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/payroll/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    // Payslip lifecycle + bulk actions
    slipEvent: async (id: string, event: 'generated' | 'downloaded' | 'emailed', fileName?: string) => { return await apiFetch(`${BASE_URL}/payroll/${id}/slip-event`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ event, fileName }) }); },
    emailSlip: async (id: string, payload: { pdfBase64?: string; fileName?: string; to?: string }) => { return await apiFetch(`${BASE_URL}/payroll/${id}/email-slip`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(payload) }); },
    approve: async (ids: string[]) => { return await apiFetch(`${BASE_URL}/payroll/approve`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ ids }) }); },
    markPaid: async (ids: string[]) => { return await apiFetch(`${BASE_URL}/payroll/mark-paid`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ ids }) }); },
    lock: async (ids: string[], reason?: string) => { return await apiFetch(`${BASE_URL}/payroll/lock`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ ids, reason }) }); },
    unlock: async (ids: string[], reason?: string) => { return await apiFetch(`${BASE_URL}/payroll/unlock`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ ids, reason }) }); },
    recalculate: async (data: { ids?: any[]; month?: string; year?: number; companyId?: any }) => { return await apiFetch(`${BASE_URL}/payroll/recalculate`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    // Bonus inside payroll — apply to selected/department/company, or remove.
    applyBonus: async (data: { companyId: any; month: string; year: number; scope: 'selected' | 'department' | 'company'; employeeIds?: any[]; department?: string; bonusType: string; calcMethod: string; amount?: number; percent?: number; reason?: string }) => { return await apiFetch(`${BASE_URL}/payroll/apply-bonus`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    removeBonus: async (data: { employeeId: any; month: string; year: number }) => { return await apiFetch(`${BASE_URL}/payroll/remove-bonus`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    // Salary Worksheet (granular earnings/deductions enhancement layer)
    worksheet: {
      get: async (payrollId: string | number) => { return await apiFetch(`${BASE_URL}/payroll/${payrollId}/worksheet`, { headers: getHeaders() }); },
      save: async (payrollId: string | number, data: any) => { return await apiFetch(`${BASE_URL}/payroll/${payrollId}/worksheet`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
      audit: async (payrollId: string | number) => { return await apiFetch(`${BASE_URL}/payroll/${payrollId}/worksheet/audit`, { headers: getHeaders() }); },
    }
  },

  attendanceSummary: {
    getAll: async (month?: string, year?: number) => {
      const p = new URLSearchParams();
      if (month) p.append('month', month);
      if (year) p.append('year', String(year));
      return await apiFetch(`${BASE_URL}/attendance-summary?${p.toString()}`, { headers: getHeaders() });
    },
    recompute: async (data: { employeeIds?: any[]; month: string; year: number; companyId?: any }) => { return await apiFetch(`${BASE_URL}/attendance-summary/recompute`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/attendance-summary/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
  },

  attendance: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/attendance`, { headers: getHeaders() }); },
    getAnalytics: async (companyId?: string, date?: string) => { 
      const params = new URLSearchParams();
      if (companyId) params.append('companyId', companyId);
      if (date) params.append('date', date);
      return await apiFetch(`${BASE_URL}/attendance/analytics?${params.toString()}`, { headers: getHeaders() }); 
    },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/attendance`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/attendance/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/attendance/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    syncPayroll: async (data: { companyId?: string; month: number; year: number; scopeIds?: string[]; dryRun?: boolean }) => {
      return await apiFetch(`${BASE_URL}/attendance/sync-payroll`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) });
    }
  },

  overtime: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/overtime`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/overtime`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/overtime/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/overtime/${id}`, { method: 'DELETE', headers: getHeaders() }); }
  },

  shifts: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/shifts`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/shifts`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/shifts/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    archive: async (id: string) => { return await apiFetch(`${BASE_URL}/shifts/${id}/archive`, { method: 'PATCH', headers: getHeaders() }); },
    assign: async (id: string, employeeIds: number[]) => { return await apiFetch(`${BASE_URL}/shifts/${id}/assign`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ employeeIds }) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/shifts/${id}`, { method: 'DELETE', headers: getHeaders() }); }
  }
};
