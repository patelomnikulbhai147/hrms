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
      let body: any;
      try {
        const errorData = await res.json();
        body = errorData;
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
      // Subscription employee cap hit on ANY create path (add / import / bulk /
      // temp-convert). Broadcast once so App can show the upgrade dialog no matter
      // which screen made the call — a single, comprehensive enforcement surface.
      if (code === 'EMPLOYEE_LIMIT_REACHED') {
        try { window.dispatchEvent(new CustomEvent('hrms:employee-limit', { detail: body })); } catch (_) { /* ignore */ }
      }
      // The audited Support Session backing a Super Admin's masquerade is gone
      // (hard expiry, or ended in another tab). Broadcast so App can leave
      // masquerade instead of leaving the tab stuck in a workspace where every
      // employee-PII request 403s and looks like a backend outage.
      if (code === 'SUPPORT_SESSION_REQUIRED') {
        try { window.dispatchEvent(new CustomEvent('hrms:support-session-expired', { detail: body })); } catch (_) { /* ignore */ }
      }
      const err: any = new Error(msg);
      err.status = res.status;
      err.code = code;
      err.data = body; // full parsed body (e.g. { duplicate: {...} } for 409s)
      err.response = { data: body, status: res.status };
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

function resolveUrl(url: string, params?: Record<string, any>) {
  let cleanUrl = url;
  if (cleanUrl.startsWith('/api/') && BASE_URL.endsWith('/api')) {
    cleanUrl = cleanUrl.slice(4);
  }
  let fullUrl = cleanUrl.startsWith('http') ? cleanUrl : `${BASE_URL}${cleanUrl.startsWith('/') ? '' : '/'}${cleanUrl}`;
  if (params) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    });
    const queryString = qs.toString();
    if (queryString) {
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString;
    }
  }
  return fullUrl;
}

async function apiFetchWithMeta(url: string, options?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const _hadToken = !!authStorage.get('hrms_jwt_token');
  if (_hadToken) authStorage.markActivity();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    let body: any = null;
    try {
      body = await res.json();
    } catch (_) {}
    if (!res.ok) {
      let msg = body?.error || body?.message || '';
      const code = body?.code;
      if (!msg) {
        if (res.status === 401) msg = 'Your session has expired. Please sign in again.';
        else if (res.status === 403) msg = 'You do not have permission to perform this action.';
        else if (res.status === 404) msg = 'The requested record was not found.';
        else if (res.status === 503) msg = 'The database is currently unreachable. Please try again shortly.';
        else if (res.status >= 500) msg = 'The server encountered an error. Please try again.';
        else msg = `Request failed (HTTP ${res.status}).`;
      }
      if (res.status === 401 && _hadToken) {
        authStorage.clearSession();
        authStorage.broadcastLogout('expired');
        try { window.dispatchEvent(new CustomEvent('hrms:unauthorized')); } catch (_) { /* ignore */ }
      }
      if (code === 'EMPLOYEE_LIMIT_REACHED') {
        try { window.dispatchEvent(new CustomEvent('hrms:employee-limit', { detail: body })); } catch (_) { /* ignore */ }
      }
      if (code === 'SUPPORT_SESSION_REQUIRED') {
        try { window.dispatchEvent(new CustomEvent('hrms:support-session-expired', { detail: body })); } catch (_) { /* ignore */ }
      }
      const err: any = new Error(msg);
      err.status = res.status;
      err.code = code;
      err.data = body;
      err.response = { data: body, status: res.status };
      throw err;
    }
    return { data: body, status: res.status };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      const e: any = new Error('The request timed out. The server took too long to respond.');
      e.isTimeout = true;
      e.isNetworkError = true;
      console.error('API Client Timeout:', url);
      throw e;
    }
    if (err instanceof TypeError) {
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
  get: async (url: string, config?: { params?: any; headers?: any }) => {
    return await apiFetchWithMeta(resolveUrl(url, config?.params), { method: 'GET', headers: { ...getHeaders(), ...(config?.headers || {}) } });
  },
  post: async (url: string, body?: any, config?: { params?: any; headers?: any }) => {
    return await apiFetchWithMeta(resolveUrl(url, config?.params), { method: 'POST', headers: { ...getHeaders(), ...(config?.headers || {}) }, body: body ? JSON.stringify(body) : undefined });
  },
  put: async (url: string, body?: any, config?: { params?: any; headers?: any }) => {
    return await apiFetchWithMeta(resolveUrl(url, config?.params), { method: 'PUT', headers: { ...getHeaders(), ...(config?.headers || {}) }, body: body ? JSON.stringify(body) : undefined });
  },
  delete: async (url: string, config?: { params?: any; headers?: any }) => {
    return await apiFetchWithMeta(resolveUrl(url, config?.params), { method: 'DELETE', headers: { ...getHeaders(), ...(config?.headers || {}) } });
  },
  auth: {
    login: async (credentials: any) => {
      return await apiFetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(credentials)
      });
    },
    getCaptchaStatus: async (data: { email: string }) => {
      return await apiFetch(`${BASE_URL}/auth/captcha-status`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    },
    getInternalCaptcha: async () => {
      return await apiFetch(`${BASE_URL}/auth/captcha`, {
        headers: getHeaders()
      });
    },
    // Public company self-registration (FREE plan). Step 1 validates + sends the
    // email OTP and returns a signed verificationToken; step 2 verifies the OTP,
    // provisions the workspace and returns { token, user } for auto-login.
    registerCompanyStart: async (data: any) => {
      return await apiFetch(`${BASE_URL}/auth/register-company/start`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
    },
    registerCompanyVerify: async (data: { verificationToken: string; otp: string }) => {
      return await apiFetch(`${BASE_URL}/auth/register-company/verify`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
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
    /**
     * Heavy branding artwork (seal / letterhead / signature) for ONE company.
     * getAll deliberately omits these — together they were 95% of its payload.
     * Use `ensureCompanyAssets` in utils/companyAssets.ts rather than calling
     * this directly; it caches and de-duplicates.
     */
    getAssets: async (id: string | number) => {
      return await apiFetch(`${BASE_URL}/companies/${encodeURIComponent(String(id))}/assets`, { headers: getHeaders() });
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
    // Department management (Settings → Manage Departments). Uses the dedicated
    // department endpoint authorized by the SETTINGS permission — NOT branding —
    // so a user with Settings → Edit can add/rename/delete/reorder departments.
    updateDepartments: async (id: string, data: any) => {
      return await apiFetch(`${BASE_URL}/companies/${id}/departments`, {
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

  // Temporary Employees (Quick Registration) — additive, isolated from employees.
  temporaryEmployees: {
    getAll: async () => apiFetch(`${BASE_URL}/temporary-employees`, { headers: getHeaders() }),
    get: async (id: any) => apiFetch(`${BASE_URL}/temporary-employees/${id}`, { headers: getHeaders() }),
    create: async (data: any) => apiFetch(`${BASE_URL}/temporary-employees`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    // Live "one mobile = one identity" check used by Quick Add before creating.
    checkMobile: async (mobile: string, excludeTempId?: any) => apiFetch(
      `${BASE_URL}/temporary-employees/check-mobile?mobile=${encodeURIComponent(mobile)}${excludeTempId ? `&excludeTempId=${encodeURIComponent(excludeTempId)}` : ''}`,
      { headers: getHeaders() },
    ),
    update: async (id: any, data: any) => apiFetch(`${BASE_URL}/temporary-employees/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
    submit: async (id: any) => apiFetch(`${BASE_URL}/temporary-employees/${id}/submit`, { method: 'POST', headers: getHeaders(), body: '{}' }),
    approve: async (id: any, employment?: any) => apiFetch(`${BASE_URL}/temporary-employees/${id}/approve`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(employment || {}) }),
    convert: async (id: any, employment?: any) => apiFetch(`${BASE_URL}/temporary-employees/${id}/approve`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(employment || {}) }),
    reject: async (id: any, reason?: string) => apiFetch(`${BASE_URL}/temporary-employees/${id}/reject`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ reason: reason || '' }) }),
    requestChanges: async (id: any, note?: string) => apiFetch(`${BASE_URL}/temporary-employees/${id}/request-changes`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ note: note || '' }) }),
    remove: async (id: any) => apiFetch(`${BASE_URL}/temporary-employees/${id}`, { method: 'DELETE', headers: getHeaders() }),
  },

  // NEW Employee-Based Subscription (Beta) — separate from the existing billing API.
  employeeSubscription: {
    getConfig: async () => apiFetch(`${BASE_URL}/employee-subscription/config`, { headers: getHeaders() }),
    updateConfig: async (data: any) => apiFetch(`${BASE_URL}/employee-subscription/config`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
    getDashboard: async (companyId: any) => apiFetch(`${BASE_URL}/employee-subscription/dashboard/${companyId}`, { headers: getHeaders() }),
    list: async () => apiFetch(`${BASE_URL}/employee-subscription`, { headers: getHeaders() }),
    update: async (companyId: any, data: any) => apiFetch(`${BASE_URL}/employee-subscription/${companyId}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
    getAudit: async (companyId?: any) => apiFetch(`${BASE_URL}/employee-subscription/audit${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`, { headers: getHeaders() }),
    branchSlot: async (companyId: any) => apiFetch(`${BASE_URL}/employee-subscription/branch-slot/${companyId}`, { headers: getHeaders() }),
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
    /** Soft-offboard a branch. Never deletes: employees are transferred,
     *  archived or marked inactive, and all history is retained. */
    offboard: async (id: string | number, data: {
      employeeAction: 'transfer' | 'archive' | 'inactive';
      destinationBranchId?: string | number | null;
      reason: string;
      effectiveDate: string;
    }) => {
      return await apiFetch(`${BASE_URL}/branches/${id}/offboard`, {
        method: 'POST',
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
    archiveBranch: async (id: string | number) => {
      return await apiFetch(`${BASE_URL}/branches/${id}/archive`, {
        method: 'POST',
        headers: getHeaders()
      });
    },
    reactivate: async (id: string | number) => {
      return await apiFetch(`${BASE_URL}/branches/${id}/reactivate`, {
        method: 'POST',
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
    // Authoritative single-record read — use this before opening an employee for
    // editing so the form is never seeded from a stale list row.
    getById: async (id: string | number) => {
      return await apiFetch(`${BASE_URL}/employees/${id}`, { headers: getHeaders() });
    },
    getPaginated: async (params: Record<string, any>) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          query.append(key, String(value));
        }
      });
      return await apiFetch(`${BASE_URL}/employees?${query.toString()}`, { headers: getHeaders() });
    },
    /**
     * Employee Cards grid, one page at a time, with each card's attendance /
     * leave / payroll records already joined server-side. Replaces the old
     * whole-company fetch of three datasets.
     * Returns { data, page, limit, total, totalPages, period }.
     */
    getCards: async (params: Record<string, any>) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') query.append(key, String(value));
      });
      return await apiFetch(`${BASE_URL}/employees/cards?${query.toString()}`, { headers: getHeaders() });
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
    // Re-hire a PREVIOUS employee: creates a NEW active record from the reviewed
    // copy and leaves the old, locked record untouched. Returns
    // { employee, previous, message }.
    reOnboard: async (previousId: string | number, data: any) => {
      return await apiFetch(`${BASE_URL}/employees/${previousId}/re-onboard`, {
        method: 'POST',
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

  // Custom Report Builder — drag & drop report designer (additive module).
  customReports: {
    meta: async () => await apiFetch(`${BASE_URL}/custom-reports/meta`, { headers: getHeaders() }),
    template: async (key: string) => await apiFetch(`${BASE_URL}/custom-reports/templates/${key}`, { headers: getHeaders() }),
    list: async (companyId?: any) => await apiFetch(`${BASE_URL}/custom-reports${companyId ? `?companyId=${companyId}` : ''}`, { headers: getHeaders() }),
    get: async (id: string) => await apiFetch(`${BASE_URL}/custom-reports/${id}`, { headers: getHeaders() }),
    run: async (body: any) => await apiFetch(`${BASE_URL}/custom-reports/run`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) }),
    create: async (body: any) => await apiFetch(`${BASE_URL}/custom-reports`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) }),
    update: async (id: string, body: any) => await apiFetch(`${BASE_URL}/custom-reports/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) }),
    duplicate: async (id: string) => await apiFetch(`${BASE_URL}/custom-reports/${id}/duplicate`, { method: 'POST', headers: getHeaders() }),
    remove: async (id: string) => await apiFetch(`${BASE_URL}/custom-reports/${id}`, { method: 'DELETE', headers: getHeaders() }),
    versions: async (id: string) => await apiFetch(`${BASE_URL}/custom-reports/${id}/versions`, { headers: getHeaders() }),
    restoreVersion: async (id: string, versionId: string) => await apiFetch(`${BASE_URL}/custom-reports/${id}/versions/${versionId}/restore`, { method: 'POST', headers: getHeaders() }),
    setSchedule: async (id: string, schedule: any) => await apiFetch(`${BASE_URL}/custom-reports/${id}/schedule`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ schedule }) }),
    sendNow: async (id: string, body: any = {}) => await apiFetch(`${BASE_URL}/custom-reports/${id}/send`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) }),
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
    // Company-scoped Add User (Settings → User Roles & Permissions). Company is
    // forced to the caller's company server-side.
    createCompanyUser: async (data: any) => { return await apiFetch(`${BASE_URL}/users/company`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
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
    /**
     * SERVER-SIDE paginated leave requests → { data, page, limit, total, totalPages }.
     * Search, status, type, branch, department and date range are all applied in
     * the database BEFORE paging, so page N of a filtered list is still one page
     * over the wire. Sorting is whitelisted server-side.
     *
     * `export: 'all'` is the one sanctioned way to receive more than a page — it
     * returns every row matching the CURRENT filters, for the export menu.
     */
    paginated: async (params: {
      companyId: any; page?: number; limit?: number; sort?: string; search?: string;
      status?: string; leaveType?: string; branch?: string; department?: string;
      from?: string; to?: string; export?: 'all';
    }) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.append(k, String(v)); });
      return await apiFetch(`${BASE_URL}/leaves/paginated?${qs.toString()}`, { headers: getHeaders() });
    },
    /** Distinct leave types / statuses / departments / branches in scope. */
    filterOptions: async (companyId: any) => {
      return await apiFetch(`${BASE_URL}/leaves/filter-options?companyId=${encodeURIComponent(String(companyId))}`, { headers: getHeaders() });
    },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/leaves`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/leaves/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/leaves/${id}`, { method: 'DELETE', headers: getHeaders() }); }
  },

  // Leave-type master + gender-based eligibility. The apply form renders
  // `eligible(employeeId)` rather than a hardcoded list, and the same rule is
  // enforced server-side on POST /leaves — this is presentation of a policy, not
  // the policy itself.
  leaveTypes: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/leave-types`, { headers: getHeaders() }); },
    eligible: async (employeeId: any) => { return await apiFetch(`${BASE_URL}/leave-types/eligible?employeeId=${encodeURIComponent(String(employeeId))}`, { headers: getHeaders() }); },
    update: async (code: string, data: { eligibleGender?: string; enabled?: boolean; label?: string; companyId?: any }) => {
      return await apiFetch(`${BASE_URL}/leave-types/${encodeURIComponent(code)}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) });
    },
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
    grantBulk: async (data: any) => { return await apiFetch(`${BASE_URL}/leave-admin/grant-bulk`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    deduct: async (data: any) => { return await apiFetch(`${BASE_URL}/leave-admin/deduct`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    reset: async (data: any) => { return await apiFetch(`${BASE_URL}/leave-admin/reset`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    transfer: async (data: any) => { return await apiFetch(`${BASE_URL}/leave-admin/transfer`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    carryForward: async (data: any) => { return await apiFetch(`${BASE_URL}/leave-admin/carry-forward`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    audit: async () => { return await apiFetch(`${BASE_URL}/leave-admin/audit`, { headers: getHeaders() }); },
    // (roster/filterOptions below serve the Leave Administration table.)
    /**
     * SERVER-SIDE paginated Leave Administration roster.
     * Returns { data, page, limit, total, totalPages }. Search, branch,
     * department, status and leave-type filtering all happen in the database, so
     * page N of a filtered list costs the same as page 1 of an unfiltered one.
     */
    roster: async (params: {
      companyId: any; page?: number; limit?: number; search?: string;
      branch?: string; department?: string; status?: string; leaveType?: string;
    }) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.append(k, String(v)); });
      return await apiFetch(`${BASE_URL}/leave-admin/roster?${qs.toString()}`, { headers: getHeaders() });
    },
    /** Distinct branch / department / leave-type values in scope, for the filters. */
    filterOptions: async (companyId: any) => {
      return await apiFetch(`${BASE_URL}/leave-admin/filter-options?companyId=${encodeURIComponent(String(companyId))}`, { headers: getHeaders() });
    },
  },

  // Attendance vendor registry — configurable catalog (E-TimeOffice, eSSL, …).
  // New vendors are added as data (Super Admin), so no code change is required.
  attendanceVendors: {
    getAll: async (all?: boolean) => { return await apiFetch(`${BASE_URL}/attendance-vendors${all ? '?all=1' : ''}`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/attendance-vendors`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/attendance-vendors/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    remove: async (id: any) => { return await apiFetch(`${BASE_URL}/attendance-vendors/${id}`, { method: 'DELETE', headers: getHeaders() }); },
  },

  // E-TimeOffice Attendance API Integration (Phase 5 — live pull sync). Config +
  // test + manual sync + run logs + dashboard. Credentials never returned plaintext.
  etimeoffice: {
    getConnection: async (companyId?: any) => { return await apiFetch(`${BASE_URL}/etimeoffice/connection${companyId ? `?companyId=${companyId}` : ''}`, { headers: getHeaders() }); },
    saveConnection: async (data: any) => { return await apiFetch(`${BASE_URL}/etimeoffice/connection`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    testConnection: async (data: any = {}) => { return await apiFetch(`${BASE_URL}/etimeoffice/connection/test`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    syncNow: async (data: any = {}) => { return await apiFetch(`${BASE_URL}/etimeoffice/sync`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    syncLogs: async (companyId?: any) => { return await apiFetch(`${BASE_URL}/etimeoffice/sync-logs${companyId ? `?companyId=${companyId}` : ''}`, { headers: getHeaders() }); },
    dashboard: async (companyId?: any) => { return await apiFetch(`${BASE_URL}/etimeoffice/dashboard${companyId ? `?companyId=${companyId}` : ''}`, { headers: getHeaders() }); },
    // Unmatched Queue + biometric mapping
    unmatched: async (companyId?: any) => { return await apiFetch(`${BASE_URL}/etimeoffice/unmatched${companyId ? `?companyId=${companyId}` : ''}`, { headers: getHeaders() }); },
    mappingEmployees: async (q = '', companyId?: any) => { const p = new URLSearchParams(); if (q) p.set('q', q); if (companyId) p.set('companyId', String(companyId)); const qs = p.toString(); return await apiFetch(`${BASE_URL}/etimeoffice/employees${qs ? `?${qs}` : ''}`, { headers: getHeaders() }); },
    resolveUnmatched: async (data: any) => { return await apiFetch(`${BASE_URL}/etimeoffice/unmatched/resolve`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    ignoreUnmatched: async (data: any) => { return await apiFetch(`${BASE_URL}/etimeoffice/unmatched/ignore`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
  },

  // Payroll Component Builder — full CRUD for the payroll component master.
  payrollComponents: {
    meta: async () => { return await apiFetch(`${BASE_URL}/payroll-components/meta`, { headers: getHeaders() }); },
    list: async (params: Record<string, any> = {}) => { const p = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, String(v)); }); const qs = p.toString(); return await apiFetch(`${BASE_URL}/payroll-components${qs ? `?${qs}` : ''}`, { headers: getHeaders() }); },
    getOne: async (id: any) => { return await apiFetch(`${BASE_URL}/payroll-components/${id}`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/payroll-components`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/payroll-components/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    clone: async (id: any) => { return await apiFetch(`${BASE_URL}/payroll-components/${id}/clone`, { method: 'POST', headers: getHeaders(), body: '{}' }); },
    setStatus: async (id: any, status: string) => { return await apiFetch(`${BASE_URL}/payroll-components/${id}/status`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ status }) }); },
    archive: async (id: any, restore = false) => { return await apiFetch(`${BASE_URL}/payroll-components/${id}/archive`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ restore }) }); },
    remove: async (id: any) => { return await apiFetch(`${BASE_URL}/payroll-components/${id}`, { method: 'DELETE', headers: getHeaders() }); },
  },

  // Invoice Management — isolated financial module (/api/invoicing).
  invoicing: {
    dashboard: async () => apiFetch(`${BASE_URL}/invoicing/dashboard`, { headers: getHeaders() }),
    // Customers
    listCustomers: async (params: Record<string, any> = {}) => { const p = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, String(v)); }); const qs = p.toString(); return apiFetch(`${BASE_URL}/invoicing/customers${qs ? `?${qs}` : ''}`, { headers: getHeaders() }); },
    getCustomerProfile: async (id: string | number) => { return await apiFetch(`${BASE_URL}/invoicing/customers/${encodeURIComponent(String(id))}/profile`, { headers: getHeaders() }); },
    saveCustomer: async (id: any, data: any) => apiFetch(`${BASE_URL}/invoicing/customers${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    deleteCustomer: async (id: any) => apiFetch(`${BASE_URL}/invoicing/customers/${id}`, { method: 'DELETE', headers: getHeaders() }),
    // Products
    listProducts: async (params: Record<string, any> = {}) => { const p = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, String(v)); }); const qs = p.toString(); return apiFetch(`${BASE_URL}/invoicing/products${qs ? `?${qs}` : ''}`, { headers: getHeaders() }); },
    saveProduct: async (id: any, data: any) => apiFetch(`${BASE_URL}/invoicing/products${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    deleteProduct: async (id: any) => apiFetch(`${BASE_URL}/invoicing/products/${id}`, { method: 'DELETE', headers: getHeaders() }),
    // Settings
    getSettings: async () => apiFetch(`${BASE_URL}/invoicing/settings`, { headers: getHeaders() }),
    saveSettings: async (data: any) => apiFetch(`${BASE_URL}/invoicing/settings`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
    // Invoices
    listInvoices: async (params: Record<string, any> = {}) => { const p = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, String(v)); }); const qs = p.toString(); return apiFetch(`${BASE_URL}/invoicing/invoices${qs ? `?${qs}` : ''}`, { headers: getHeaders() }); },
    getInvoice: async (id: any) => apiFetch(`${BASE_URL}/invoicing/invoices/${id}`, { headers: getHeaders() }),
    createInvoice: async (data: any) => apiFetch(`${BASE_URL}/invoicing/invoices`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    updateInvoice: async (id: any, data: any) => apiFetch(`${BASE_URL}/invoicing/invoices/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
    duplicateInvoice: async (id: any) => apiFetch(`${BASE_URL}/invoicing/invoices/${id}/duplicate`, { method: 'POST', headers: getHeaders(), body: '{}' }),
    setInvoiceStatus: async (id: any, status: string) => apiFetch(`${BASE_URL}/invoicing/invoices/${id}/status`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ status }) }),
    logInvoiceAction: async (id: any, action: string, detail?: string) => apiFetch(`${BASE_URL}/invoicing/invoices/${id}/log`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ action, detail }) }),
    // Email the invoice with its PDF attached. `html` is the exact document the
    // client is rendering, so the attachment matches the invoice on screen.
    emailInvoice: async (id: any, data: { to: string; cc?: string; subject?: string; message?: string; html?: string }) =>
      apiFetch(`${BASE_URL}/invoicing/invoices/${id}/email`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    getReminderCenter: async (id: any) => apiFetch(`${BASE_URL}/invoicing/invoices/${id}/reminder-center`, { headers: getHeaders() }),
    sendReminder: async (id: any, data: any) => apiFetch(`${BASE_URL}/invoicing/invoices/${id}/remind`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    rescheduleDueDate: async (id: any, dueDate: string) => apiFetch(`${BASE_URL}/invoicing/invoices/${id}/reschedule`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ dueDate }) }),
    sendThankYou: async (id: any, data: any) => apiFetch(`${BASE_URL}/invoicing/invoices/${id}/thank-you`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    deleteInvoice: async (id: any) => apiFetch(`${BASE_URL}/invoicing/invoices/${id}`, { method: 'DELETE', headers: getHeaders() }),
    recordPayment: async (id: any, data: any) => apiFetch(`${BASE_URL}/invoicing/invoices/${id}/payments`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    deletePayment: async (paymentId: any) => apiFetch(`${BASE_URL}/invoicing/payments/${paymentId}`, { method: 'DELETE', headers: getHeaders() }),
    // Visual Invoice Designer — per-company named canvas layouts (additive/opt-in).
    listLayouts: async () => apiFetch(`${BASE_URL}/invoicing/layouts`, { headers: getHeaders() }),
    getLayout: async (id: any) => apiFetch(`${BASE_URL}/invoicing/layouts/${id}`, { headers: getHeaders() }),
    saveLayout: async (id: any, data: any) => apiFetch(`${BASE_URL}/invoicing/layouts${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    setLayoutDefault: async (id: any, active: boolean) => apiFetch(`${BASE_URL}/invoicing/layouts/${id}/default`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ active }) }),
    deleteLayout: async (id: any) => apiFetch(`${BASE_URL}/invoicing/layouts/${id}`, { method: 'DELETE', headers: getHeaders() }),
  },

  // Employee Loan Management — loans, EMI schedule (ledger), approval workflow,
  // dashboard, employee portal, reports. Auto-deducts via the payroll engine.
  loans: {
    dashboard: async () => apiFetch(`${BASE_URL}/loans/dashboard`, { headers: getHeaders() }),
    previewEmi: async (data: any) => apiFetch(`${BASE_URL}/loans/preview`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    // Loan types
    listTypes: async () => apiFetch(`${BASE_URL}/loans/types`, { headers: getHeaders() }),
    saveType: async (id: any, data: any) => apiFetch(`${BASE_URL}/loans/types${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    deleteType: async (id: any) => apiFetch(`${BASE_URL}/loans/types/${id}`, { method: 'DELETE', headers: getHeaders() }),
    // Loans
    list: async (params: Record<string, any> = {}) => { const p = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, String(v)); }); const qs = p.toString(); return apiFetch(`${BASE_URL}/loans${qs ? `?${qs}` : ''}`, { headers: getHeaders() }); },
    get: async (id: any) => apiFetch(`${BASE_URL}/loans/${id}`, { headers: getHeaders() }),
    create: async (data: any) => apiFetch(`${BASE_URL}/loans`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    update: async (id: any, data: any) => apiFetch(`${BASE_URL}/loans/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
    duplicate: async (id: any) => apiFetch(`${BASE_URL}/loans/${id}/duplicate`, { method: 'POST', headers: getHeaders(), body: '{}' }),
    setStatus: async (id: any, action: string, extra: any = {}) => apiFetch(`${BASE_URL}/loans/${id}/status`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ action, ...extra }) }),
    remove: async (id: any) => apiFetch(`${BASE_URL}/loans/${id}`, { method: 'DELETE', headers: getHeaders() }),
    // Employee portal + reports
    myLoans: async () => apiFetch(`${BASE_URL}/loans/portal/me`, { headers: getHeaders() }),
    report: async (key: string, params: Record<string, any> = {}) => { const p = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, String(v)); }); const qs = p.toString(); return apiFetch(`${BASE_URL}/loans/reports/${key}${qs ? `?${qs}` : ''}`, { headers: getHeaders() }); },
    runReminders: async () => apiFetch(`${BASE_URL}/loans/run-reminders`, { method: 'POST', headers: getHeaders(), body: '{}' }),
  },

  // Employee Card Designer — per-company custom/edited card templates.
  cardTemplates: {
    list: async () => apiFetch(`${BASE_URL}/card-templates`, { headers: getHeaders() }),
    get: async (id: any) => apiFetch(`${BASE_URL}/card-templates/${id}`, { headers: getHeaders() }),
    save: async (data: any) => apiFetch(`${BASE_URL}/card-templates`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    remove: async (id: any) => apiFetch(`${BASE_URL}/card-templates/${id}`, { method: 'DELETE', headers: getHeaders() }),
    setDefault: async (id: any) => apiFetch(`${BASE_URL}/card-templates/${id}/default`, { method: 'POST', headers: getHeaders(), body: '{}' }),
    getActive: async () => apiFetch(`${BASE_URL}/card-templates/active`, { headers: getHeaders() }),
    setActive: async (templateId: string) => apiFetch(`${BASE_URL}/card-templates/active`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ templateId }) }),
    setShared: async (id: any, shared: boolean) => apiFetch(`${BASE_URL}/card-templates/${id}/share`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ shared }) }),
  },

  // Compliance Management — statutory filing calendar / due-date tracker.
  compliance: {
    dashboard: async () => apiFetch(`${BASE_URL}/compliance-mgmt/dashboard`, { headers: getHeaders() }),
    categories: async () => apiFetch(`${BASE_URL}/compliance-mgmt/categories`, { headers: getHeaders() }),
    regenerate: async () => apiFetch(`${BASE_URL}/compliance-mgmt/regenerate`, { method: 'POST', headers: getHeaders(), body: '{}' }),
    runReminders: async () => apiFetch(`${BASE_URL}/compliance-mgmt/run-reminders`, { method: 'POST', headers: getHeaders(), body: '{}' }),
    listFilings: async (params: Record<string, any> = {}) => { const p = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, String(v)); }); const qs = p.toString(); return apiFetch(`${BASE_URL}/compliance-mgmt/filings${qs ? `?${qs}` : ''}`, { headers: getHeaders() }); },
    getFiling: async (id: any) => apiFetch(`${BASE_URL}/compliance-mgmt/filings/${id}`, { headers: getHeaders() }),
    saveFiling: async (id: any, data: any) => apiFetch(`${BASE_URL}/compliance-mgmt/filings${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    setFilingStatus: async (id: any, action: string, extra: any = {}) => apiFetch(`${BASE_URL}/compliance-mgmt/filings/${id}/status`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ action, ...extra }) }),
    uploadChallan: async (id: any, data: any) => apiFetch(`${BASE_URL}/compliance-mgmt/filings/${id}/challan`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    deleteFiling: async (id: any) => apiFetch(`${BASE_URL}/compliance-mgmt/filings/${id}`, { method: 'DELETE', headers: getHeaders() }),
  },

  // Finance & Compliance → Documents. Isolated statutory document repository
  // (its own compliance_documents table; never mixed with the general Documents
  // module). List omits the base64 blob; getOne returns it for view/download.
  complianceDocuments: {
    list: async (params: Record<string, any> = {}) => { const p = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, String(v)); }); const qs = p.toString(); return apiFetch(`${BASE_URL}/compliance-documents${qs ? `?${qs}` : ''}`, { headers: getHeaders() }); },
    summary: async () => apiFetch(`${BASE_URL}/compliance-documents/summary`, { headers: getHeaders() }),
    categories: async () => apiFetch(`${BASE_URL}/compliance-documents/categories`, { headers: getHeaders() }),
    getOne: async (id: any) => apiFetch(`${BASE_URL}/compliance-documents/${id}`, { headers: getHeaders() }),
    create: async (data: any) => apiFetch(`${BASE_URL}/compliance-documents`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    update: async (id: any, data: any) => apiFetch(`${BASE_URL}/compliance-documents/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
    remove: async (id: any) => apiFetch(`${BASE_URL}/compliance-documents/${id}`, { method: 'DELETE', headers: getHeaders() }),
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

  // Attendance Excel Import engine — parses biometric sheets into attendance.
  // The client sends canonical punch rows; the server matches, derives status and
  // upserts idempotently (one row per employee+date). dryRun previews without writing.
  attendanceImport: {
    process: async (payload: { companyId?: any; fileName?: string; dryRun?: boolean; options?: any; rows: any[] }) => {
      return await apiFetch(`${BASE_URL}/attendance-import/process`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(payload) });
    },
    logs: async (status?: string) => {
      const q = status ? `?status=${encodeURIComponent(status)}` : '';
      return await apiFetch(`${BASE_URL}/attendance-import/logs${q}`, { headers: getHeaders() });
    },
    unmatched: async () => { return await apiFetch(`${BASE_URL}/attendance-import/unmatched`, { headers: getHeaders() }); },
    history: async () => { return await apiFetch(`${BASE_URL}/attendance-import/history`, { headers: getHeaders() }); },
  },

  // Government Compliance Reports — live statutory reports from DB.
  complianceReports: {
    catalog: async () => { return await apiFetch(`${BASE_URL}/compliance-reports/catalog`, { headers: getHeaders() }); },
    // Payroll cycles that actually exist for the active workspace, newest first.
    payrollPeriods: async () => { return await apiFetch(`${BASE_URL}/compliance-reports/payroll-periods`, { headers: getHeaders() }); },
    generate: async (data: any) => { return await apiFetch(`${BASE_URL}/compliance-reports/generate`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    // Sample preview using the VISHV ENTERPRISE demo company (never touches real data).
    preview: async (reportKey: string) => { return await apiFetch(`${BASE_URL}/compliance-reports/preview`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ reportKey }) }); },
    logDownload: async (data: any) => { return await apiFetch(`${BASE_URL}/compliance-reports/log-download`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    audit: async () => { return await apiFetch(`${BASE_URL}/compliance-reports/audit`, { headers: getHeaders() }); },
  },

  // EPFO ECR Generation — isolated PF report (own endpoints; never touches other reports).
  epfoEcr: {
    preview: async (data: any) => { return await apiFetch(`${BASE_URL}/epfo-ecr/preview`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    generate: async (data: any) => { return await apiFetch(`${BASE_URL}/epfo-ecr/generate`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    history: async (companyId?: string | number) => { return await apiFetch(`${BASE_URL}/epfo-ecr/history${companyId ? `?companyId=${companyId}` : ''}`, { headers: getHeaders() }); },
    download: async (id: number | string) => { return await apiFetch(`${BASE_URL}/epfo-ecr/history/${id}/download`, { headers: getHeaders() }); },
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
    lookup: async (code: string) => { return await apiFetch(`${BASE_URL}/bank/ifsc/${encodeURIComponent(code)}`, { headers: getHeaders() }); },
  },

  // Smart Bank Account Verification & IFSC Lookup
  bank: {
    ifscLookup: async (ifsc: string) => { return await apiFetch(`${BASE_URL}/bank/ifsc/${encodeURIComponent(ifsc)}`, { headers: getHeaders() }); },
    verifyAccount: async (payload: { ifsc: string; accountNumber: string; employeeName?: string; employeeId?: string | number }) => {
      return await apiFetch(`${BASE_URL}/bank/verify-account`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(payload) });
    },
    logManualOverride: async (payload: { ifsc?: string; accountNumber?: string; reason?: string; employeeId?: string | number }) => {
      return await apiFetch(`${BASE_URL}/bank/log-manual-override`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(payload) });
    },

    // Permanent verification history. Reading these NEVER calls the provider and
    // never costs a credit — only verifyAccount does.
    verifications: async (params: Record<string, any> = {}) => {
      const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '') as [string, string][]
      ).toString();
      return await apiFetch(`${BASE_URL}/bank/verifications${qs ? `?${qs}` : ''}`, { headers: getHeaders() });
    },
    verification: async (id: string | number) => {
      return await apiFetch(`${BASE_URL}/bank/verifications/${encodeURIComponent(String(id))}`, { headers: getHeaders() });
    },
    latestVerification: async (employeeId: string | number) => {
      return await apiFetch(`${BASE_URL}/bank/verifications/latest/${encodeURIComponent(String(employeeId))}`, { headers: getHeaders() });
    },
    linkVerification: async (payload: { referenceId: string; employeeId: string | number }) => {
      return await apiFetch(`${BASE_URL}/bank/verifications/link`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(payload) });
    },
    payrollPolicy: async () => {
      return await apiFetch(`${BASE_URL}/bank/payroll-policy`, { headers: getHeaders() });
    },
    savePayrollPolicy: async (requireVerifiedBankForPayroll: boolean) => {
      return await apiFetch(`${BASE_URL}/bank/payroll-policy`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ requireVerifiedBankForPayroll }) });
    },
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
    getAll: async (query: string = '') => { return await apiFetch(`${BASE_URL}/tenders${query}`, { headers: getHeaders() }); },
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
    /**
     * File CONTENTS for one document. getAll omits `fileData` (it was 99.9% of
     * that response), so anything that previews or downloads a file fetches it
     * here. Returns { id, fileData, mimeType, name }.
     */
    getFile: async (id: string | number) => { return await apiFetch(`${BASE_URL}/documents/${encodeURIComponent(String(id))}/file`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/documents`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/documents/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/documents/${id}`, { method: 'DELETE', headers: getHeaders() }); }
  },

  // Company Profile — master repository (company record + contacts + company
  // documents + branches + document health). Reads scoped to the caller's company.
  companyProfile: {
    get: async () => { return await apiFetch(`${BASE_URL}/company-profile`, { headers: getHeaders() }); },
    documentHealth: async (notify = false) => { return await apiFetch(`${BASE_URL}/company-profile/document-health${notify ? '?notify=1' : ''}`, { headers: getHeaders() }); },
    audit: async (limit?: number) => { return await apiFetch(`${BASE_URL}/company-profile/audit${limit ? `?limit=${limit}` : ''}`, { headers: getHeaders() }); },
    contacts: {
      list: async () => { return await apiFetch(`${BASE_URL}/company-profile/contacts`, { headers: getHeaders() }); },
      create: async (data: any) => { return await apiFetch(`${BASE_URL}/company-profile/contacts`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
      update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/company-profile/contacts/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
      remove: async (id: any) => { return await apiFetch(`${BASE_URL}/company-profile/contacts/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    },
    owners: {
      list: async () => { return await apiFetch(`${BASE_URL}/company-profile/owners`, { headers: getHeaders() }); },
      create: async (data: any) => { return await apiFetch(`${BASE_URL}/company-profile/owners`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
      update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/company-profile/owners/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
      remove: async (id: any) => { return await apiFetch(`${BASE_URL}/company-profile/owners/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    },
    documents: {
      list: async () => { return await apiFetch(`${BASE_URL}/company-profile/documents`, { headers: getHeaders() }); },
      create: async (data: any) => { return await apiFetch(`${BASE_URL}/company-profile/documents`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
      update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/company-profile/documents/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
      remove: async (id: any) => { return await apiFetch(`${BASE_URL}/company-profile/documents/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    },
    compliance: {
      list: async (notify = false) => { return await apiFetch(`${BASE_URL}/company-profile/compliance${notify ? '?notify=1' : ''}`, { headers: getHeaders() }); },
      create: async (data: any) => { return await apiFetch(`${BASE_URL}/company-profile/compliance`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
      update: async (id: any, data: any) => { return await apiFetch(`${BASE_URL}/company-profile/compliance/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
      remove: async (id: any) => { return await apiFetch(`${BASE_URL}/company-profile/compliance/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    },
  },

  // System Settings → Third Party Integrations. Google Maps is a GLOBAL
  // installation setting managed only by a Super Admin (installer). `publicConfig`
  // is the runtime key any authenticated user needs to load the Maps JS API.
  systemSettings: {
    googleMaps: {
      publicConfig: async () => { return await apiFetch(`${BASE_URL}/system-settings/google-maps/public`, { headers: getHeaders() }); },
      geocode: async (data: { url?: string; lat?: number; lng?: number }) => { return await apiFetch(`${BASE_URL}/system-settings/google-maps/geocode`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
      get: async () => { return await apiFetch(`${BASE_URL}/system-settings/google-maps`, { headers: getHeaders() }); },
      update: async (data: { apiKey: string }) => { return await apiFetch(`${BASE_URL}/system-settings/google-maps`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
      test: async (data?: { apiKey?: string }) => { return await apiFetch(`${BASE_URL}/system-settings/google-maps/test`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data || {}) }); },
    },
    security: {
      get: async () => { return await apiFetch(`${BASE_URL}/system-settings/security`, { headers: getHeaders() }); },
      update: async (data: any) => { return await apiFetch(`${BASE_URL}/system-settings/security`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); }
    }
  },

  // Verification Credit Recharge (self-service, Cashfree PG). Tenant endpoints
  // are company-resolved on the backend; responses never include internal
  // pricing. The admin.* group is Super-Admin-only (hard-gated server-side).
  recharge: {
    config: async () => apiFetch(`${BASE_URL}/verification-credits/recharge/config`, { headers: getHeaders() }),
    quote: async (amount: number) => apiFetch(`${BASE_URL}/verification-credits/recharge/quote`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ amount }) }),
    createOrder: async (data: { amount?: number; packageId?: number }) => apiFetch(`${BASE_URL}/verification-credits/recharge/orders`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    verifyOrder: async (orderId: string) => apiFetch(`${BASE_URL}/verification-credits/recharge/orders/${encodeURIComponent(orderId)}/verify`, { method: 'POST', headers: getHeaders() }),
    history: async (params?: { page?: number; pageSize?: number }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.pageSize) q.set('pageSize', String(params.pageSize));
      return apiFetch(`${BASE_URL}/verification-credits/recharge/history${q.toString() ? `?${q}` : ''}`, { headers: getHeaders() });
    },
    /** Downloads the invoice PDF as a Blob (authenticated fetch, not a bare link). */
    downloadInvoice: async (invoiceId: number): Promise<Blob> => {
      const res = await fetch(`${BASE_URL}/verification-credits/recharge/invoices/${invoiceId}/download`, { headers: getHeaders() });
      if (!res.ok) {
        let msg = 'Could not download the invoice.';
        try { msg = (await res.json())?.error || msg; } catch { /* keep default */ }
        throw new Error(msg);
      }
      return res.blob();
    },
    admin: {
      settings: async () => apiFetch(`${BASE_URL}/super-admin/verification-credits/recharge/settings`, { headers: getHeaders() }),
      updateSettings: async (data: any) => apiFetch(`${BASE_URL}/super-admin/verification-credits/recharge/settings`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
      packages: async () => apiFetch(`${BASE_URL}/super-admin/verification-credits/recharge/packages`, { headers: getHeaders() }),
      savePackage: async (data: any) => apiFetch(`${BASE_URL}/super-admin/verification-credits/recharge/packages${data?.id ? `/${data.id}` : ''}`, { method: data?.id ? 'PUT' : 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
      deletePackage: async (id: number) => apiFetch(`${BASE_URL}/super-admin/verification-credits/recharge/packages/${id}`, { method: 'DELETE', headers: getHeaders() }),
      orders: async (params?: Record<string, any>) => {
        const q = new URLSearchParams();
        Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, String(v)); });
        return apiFetch(`${BASE_URL}/super-admin/verification-credits/recharge/orders${q.toString() ? `?${q}` : ''}`, { headers: getHeaders() });
      },
      approveOrder: async (orderId: string) => apiFetch(`${BASE_URL}/super-admin/verification-credits/recharge/orders/${encodeURIComponent(orderId)}/approve`, { method: 'POST', headers: getHeaders() }),
      reverifyOrder: async (orderId: string) => apiFetch(`${BASE_URL}/super-admin/verification-credits/recharge/orders/${encodeURIComponent(orderId)}/reverify`, { method: 'POST', headers: getHeaders() }),
      regenerateInvoice: async (orderId: string) => apiFetch(`${BASE_URL}/super-admin/verification-credits/recharge/orders/${encodeURIComponent(orderId)}/regenerate-invoice`, { method: 'POST', headers: getHeaders() }),
      refunds: async (params?: { page?: number; pageSize?: number }) => {
        const q = new URLSearchParams();
        if (params?.page) q.set('page', String(params.page));
        if (params?.pageSize) q.set('pageSize', String(params.pageSize));
        return apiFetch(`${BASE_URL}/super-admin/verification-credits/recharge/refunds${q.toString() ? `?${q}` : ''}`, { headers: getHeaders() });
      },
      markRefundAdjusted: async (id: number) => apiFetch(`${BASE_URL}/super-admin/verification-credits/recharge/refunds/${id}/mark-adjusted`, { method: 'PUT', headers: getHeaders() }),
      dashboard: async () => apiFetch(`${BASE_URL}/super-admin/verification-credits/recharge/dashboard`, { headers: getHeaders() }),
    },
  },

  // White Label & Custom Domain (Beta). Company endpoints are plan-gated
  // server-side (custom-domain module); writes are Company Head only.
  customDomain: {
    overview: async () => apiFetch(`${BASE_URL}/custom-domain/overview`, { headers: getHeaders() }),
    addDomain: async (domain: string) => apiFetch(`${BASE_URL}/custom-domain/domains`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ domain }) }),
    verify: async () => apiFetch(`${BASE_URL}/custom-domain/domains/verify`, { method: 'POST', headers: getHeaders() }),
    refresh: async () => apiFetch(`${BASE_URL}/custom-domain/domains/refresh`, { method: 'POST', headers: getHeaders() }),
    remove: async () => apiFetch(`${BASE_URL}/custom-domain/domains`, { method: 'DELETE', headers: getHeaders() }),
    saveWhiteLabel: async (data: any) => apiFetch(`${BASE_URL}/custom-domain/white-label`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
    status: async () => apiFetch(`${BASE_URL}/custom-domain/status`, { headers: getHeaders() }),
    health: async () => apiFetch(`${BASE_URL}/custom-domain/health`, { headers: getHeaders() }),
    // Public (pre-login): login-page branding for the current host.
    hostBranding: async (host: string) => apiFetch(`${BASE_URL}/public/host-branding?host=${encodeURIComponent(host)}`, { headers: getHeaders() }),
    admin: {
      mappings: async () => apiFetch(`${BASE_URL}/super-admin/white-label/mappings`, { headers: getHeaders() }),
      disable: async (id: number) => apiFetch(`${BASE_URL}/super-admin/white-label/mappings/${id}/disable`, { method: 'POST', headers: getHeaders() }),
      enable: async (id: number) => apiFetch(`${BASE_URL}/super-admin/white-label/mappings/${id}/enable`, { method: 'POST', headers: getHeaders() }),
      reverify: async (id: number) => apiFetch(`${BASE_URL}/super-admin/white-label/mappings/${id}/reverify`, { method: 'POST', headers: getHeaders() }),
      remove: async (id: number) => apiFetch(`${BASE_URL}/super-admin/white-label/mappings/${id}`, { method: 'DELETE', headers: getHeaders() }),
      renewSweep: async () => apiFetch(`${BASE_URL}/super-admin/white-label/ssl/renew-sweep`, { method: 'POST', headers: getHeaders() }),
    },
  },

  // Subscription Purchase — the self-service upgrade/renewal wizard. The
  // client only ever sends { planKey, billingCycle, employeeCount }; price,
  // discount, GST and limits are computed server-side and frozen on the order.
  subscriptionPurchase: {
    context: async () => apiFetch(`${BASE_URL}/subscription-purchase/context`, { headers: getHeaders() }),
    quote: async (data: { planKey: string; billingCycle: string; employeeCount: number }) =>
      apiFetch(`${BASE_URL}/subscription-purchase/quote`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    createOrder: async (data: { planKey: string; billingCycle: string; employeeCount: number }) =>
      apiFetch(`${BASE_URL}/subscription-purchase/orders`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    verifyOrder: async (orderId: string) =>
      apiFetch(`${BASE_URL}/subscription-purchase/orders/${encodeURIComponent(orderId)}/verify`, { method: 'POST', headers: getHeaders() }),
    history: async () => apiFetch(`${BASE_URL}/subscription-purchase/history`, { headers: getHeaders() }),
  },

  // Employee Slot Management — plan-limit add-ons. Company endpoints resolve
  // the tenant server-side; only a settled payment or a Super Admin can raise
  // a limit. Slot invoices share the recharge invoice download endpoint.
  employeeSlots: {
    overview: async () => apiFetch(`${BASE_URL}/employee-slots/overview`, { headers: getHeaders() }),
    quote: async (slots: number) => apiFetch(`${BASE_URL}/employee-slots/quote`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ slots }) }),
    createOrder: async (data: { slots?: number; packId?: number }) => apiFetch(`${BASE_URL}/employee-slots/orders`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    verifyOrder: async (orderId: string) => apiFetch(`${BASE_URL}/employee-slots/orders/${encodeURIComponent(orderId)}/verify`, { method: 'POST', headers: getHeaders() }),
    request: async (data: { packId?: number; slots?: number; note?: string }) => apiFetch(`${BASE_URL}/employee-slots/request`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    history: async () => apiFetch(`${BASE_URL}/employee-slots/history`, { headers: getHeaders() }),
    admin: {
      packs: async () => apiFetch(`${BASE_URL}/super-admin/employee-slots/packs`, { headers: getHeaders() }),
      savePack: async (data: any) => apiFetch(`${BASE_URL}/super-admin/employee-slots/packs${data?.id ? `/${data.id}` : ''}`, { method: data?.id ? 'PUT' : 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
      deletePack: async (id: number) => apiFetch(`${BASE_URL}/super-admin/employee-slots/packs/${id}`, { method: 'DELETE', headers: getHeaders() }),
      requests: async () => apiFetch(`${BASE_URL}/super-admin/employee-slots/requests`, { headers: getHeaders() }),
      approveRequest: async (id: number) => apiFetch(`${BASE_URL}/super-admin/employee-slots/requests/${id}/approve`, { method: 'POST', headers: getHeaders() }),
      rejectRequest: async (id: number, reason?: string) => apiFetch(`${BASE_URL}/super-admin/employee-slots/requests/${id}/reject`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ reason }) }),
      adjust: async (data: { companyId: number; delta: number; reason: string }) => apiFetch(`${BASE_URL}/super-admin/employee-slots/adjust`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
      transactions: async (params?: Record<string, any>) => {
        const q = new URLSearchParams();
        Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, String(v)); });
        return apiFetch(`${BASE_URL}/super-admin/employee-slots/transactions${q.toString() ? `?${q}` : ''}`, { headers: getHeaders() });
      },
      usage: async () => apiFetch(`${BASE_URL}/super-admin/employee-slots/usage`, { headers: getHeaders() }),
    },
  },

  // Communication Center (Phase 1 — storage only, no sending). Scoped to caller's
  // company; gated to Super Admin + Company Head on the backend.
  communication: {
    categories: async () => apiFetch(`${BASE_URL}/communication/categories`, { headers: getHeaders() }),
    placeholders: async () => apiFetch(`${BASE_URL}/communication/placeholders`, { headers: getHeaders() }),
    sampleTemplates: async () => apiFetch(`${BASE_URL}/communication/sample-templates`, { headers: getHeaders() }),
    sampleHolidays: async (year?: number) => apiFetch(`${BASE_URL}/communication/sample-holidays${year ? `?year=${year}` : ''}`, { headers: getHeaders() }),
    dashboard: async () => apiFetch(`${BASE_URL}/communication/dashboard`, { headers: getHeaders() }),
    holidays: {
      list: async (year?: number) => apiFetch(`${BASE_URL}/communication/holidays${year ? `?year=${year}` : ''}`, { headers: getHeaders() }),
      create: async (data: any) => apiFetch(`${BASE_URL}/communication/holidays`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
      update: async (id: any, data: any) => apiFetch(`${BASE_URL}/communication/holidays/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
      remove: async (id: any) => apiFetch(`${BASE_URL}/communication/holidays/${id}`, { method: 'DELETE', headers: getHeaders() }),
      import: async (holidays: any[]) => apiFetch(`${BASE_URL}/communication/holidays/import`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ holidays }) }),
    },
    templates: {
      list: async (category?: string) => apiFetch(`${BASE_URL}/communication/templates${category && category !== 'All' ? `?category=${encodeURIComponent(category)}` : ''}`, { headers: getHeaders() }),
      create: async (data: any) => apiFetch(`${BASE_URL}/communication/templates`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
      update: async (id: any, data: any) => apiFetch(`${BASE_URL}/communication/templates/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
      remove: async (id: any) => apiFetch(`${BASE_URL}/communication/templates/${id}`, { method: 'DELETE', headers: getHeaders() }),
    },
    schedules: {
      list: async () => apiFetch(`${BASE_URL}/communication/schedules`, { headers: getHeaders() }),
      create: async (data: any) => apiFetch(`${BASE_URL}/communication/schedules`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
      update: async (id: any, data: any) => apiFetch(`${BASE_URL}/communication/schedules/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
      remove: async (id: any) => apiFetch(`${BASE_URL}/communication/schedules/${id}`, { method: 'DELETE', headers: getHeaders() }),
    },
    announcements: {
      list: async () => apiFetch(`${BASE_URL}/communication/announcements`, { headers: getHeaders() }),
      create: async (data: any) => apiFetch(`${BASE_URL}/communication/announcements`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
      update: async (id: any, data: any) => apiFetch(`${BASE_URL}/communication/announcements/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
      remove: async (id: any) => apiFetch(`${BASE_URL}/communication/announcements/${id}`, { method: 'DELETE', headers: getHeaders() }),
    },
    deliveryLogs: async () => apiFetch(`${BASE_URL}/communication/delivery-logs`, { headers: getHeaders() }),
    settings: {
      get: async () => apiFetch(`${BASE_URL}/communication/settings`, { headers: getHeaders() }),
      update: async (data: any) => apiFetch(`${BASE_URL}/communication/settings`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
    },
    // WhatsApp integration foundation (Phase 1 — NO messages are ever sent).
    whatsapp: {
      settings: {
        get: async () => apiFetch(`${BASE_URL}/communication/whatsapp/settings`, { headers: getHeaders() }),
        update: async (data: any) => apiFetch(`${BASE_URL}/communication/whatsapp/settings`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
      },
      placeholders: async () => apiFetch(`${BASE_URL}/communication/whatsapp/placeholders`, { headers: getHeaders() }),
      templates: async () => apiFetch(`${BASE_URL}/communication/whatsapp/templates`, { headers: getHeaders() }),
      queue: async () => apiFetch(`${BASE_URL}/communication/whatsapp/queue`, { headers: getHeaders() }),
      logs: async () => apiFetch(`${BASE_URL}/communication/whatsapp/logs`, { headers: getHeaders() }),
      diagnostics: async () => apiFetch(`${BASE_URL}/communication/whatsapp/diagnostics`, { headers: getHeaders() }),
      schedulerPreview: async () => apiFetch(`${BASE_URL}/communication/whatsapp/scheduler-preview`, { headers: getHeaders() }),
      test: async () => apiFetch(`${BASE_URL}/communication/whatsapp/test`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({}) }),
      // Phase 2 — real Meta Cloud API
      connectionTest: async () => apiFetch(`${BASE_URL}/communication/whatsapp/connection-test`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({}) }),
      sendTest: async () => apiFetch(`${BASE_URL}/communication/whatsapp/send-test`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({}) }),
      // Phase 2.5 — production hardening
      requestHistory: async () => apiFetch(`${BASE_URL}/communication/whatsapp/request-history`, { headers: getHeaders() }),
      // Phase 5 — enterprise completion (analytics, search, inspector, health, retry)
      analytics: async () => apiFetch(`${BASE_URL}/communication/whatsapp/analytics`, { headers: getHeaders() }),
      messagesSearch: async (params: Record<string, string> = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '' && v !== 'All')).toString();
        return apiFetch(`${BASE_URL}/communication/whatsapp/messages/search${qs ? `?${qs}` : ''}`, { headers: getHeaders() });
      },
      messageDetail: async (id: any) => apiFetch(`${BASE_URL}/communication/whatsapp/messages/${id}`, { headers: getHeaders() }),
      conversation: async (params: Record<string, string> = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
        return apiFetch(`${BASE_URL}/communication/whatsapp/conversation${qs ? `?${qs}` : ''}`, { headers: getHeaders() });
      },
      webhookHealth: async () => apiFetch(`${BASE_URL}/communication/whatsapp/webhook-health`, { headers: getHeaders() }),
      queueMonitor: async () => apiFetch(`${BASE_URL}/communication/whatsapp/queue-monitor`, { headers: getHeaders() }),
      retryPolicy: async () => apiFetch(`${BASE_URL}/communication/whatsapp/retry-policy`, { headers: getHeaders() }),
      retry: async (logId?: any) => apiFetch(`${BASE_URL}/communication/whatsapp/retry`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(logId ? { logId } : {}) }),
      // Image-template integration — render a ZeniaHR gallery design and send it
      // as an approved WhatsApp IMAGE template (header media).
      imagePreview: async (data: { templateId: any; employeeId?: any }) => apiFetch(`${BASE_URL}/communication/whatsapp/image/preview`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
      imageSend: async (data: { templateId: any; employeeId?: any; toOverride?: string; useImageFallback?: boolean; automationRuleId?: any }) => apiFetch(`${BASE_URL}/communication/whatsapp/image/send`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
      imageTest: async (data: { templateId: any; employeeId?: any }) => apiFetch(`${BASE_URL}/communication/whatsapp/image/test`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
      // Phase 3 — template management
      mgmt: {
        meta: async () => apiFetch(`${BASE_URL}/communication/whatsapp/templates/meta`, { headers: getHeaders() }),
        sync: async () => apiFetch(`${BASE_URL}/communication/whatsapp/templates/sync`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({}) }),
        mappings: async () => apiFetch(`${BASE_URL}/communication/whatsapp/templates/mappings`, { headers: getHeaders() }),
        saveMapping: async (data: any) => apiFetch(`${BASE_URL}/communication/whatsapp/templates/mappings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
        removeMapping: async (id: any) => apiFetch(`${BASE_URL}/communication/whatsapp/templates/mappings/${id}`, { method: 'DELETE', headers: getHeaders() }),
        testMapping: async (id: any) => apiFetch(`${BASE_URL}/communication/whatsapp/templates/mappings/${id}/test`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({}) }),
        events: async () => apiFetch(`${BASE_URL}/communication/whatsapp/templates/events`, { headers: getHeaders() }),
      },
    },
    // Phase 4 — Communication Automation Engine
    automation: {
      meta: async () => apiFetch(`${BASE_URL}/communication/automation/meta`, { headers: getHeaders() }),
      rules: async () => apiFetch(`${BASE_URL}/communication/automation/rules`, { headers: getHeaders() }),
      createRule: async (data: any) => apiFetch(`${BASE_URL}/communication/automation/rules`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
      updateRule: async (id: any, data: any) => apiFetch(`${BASE_URL}/communication/automation/rules/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
      removeRule: async (id: any) => apiFetch(`${BASE_URL}/communication/automation/rules/${id}`, { method: 'DELETE', headers: getHeaders() }),
      execute: async (id: any, mode: string) => apiFetch(`${BASE_URL}/communication/automation/rules/${id}/execute`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ mode }) }),
      runs: async () => apiFetch(`${BASE_URL}/communication/automation/runs`, { headers: getHeaders() }),
      scheduler: async () => apiFetch(`${BASE_URL}/communication/automation/scheduler`, { headers: getHeaders() }),
    },
    // Communication Audit Trail (reuses AuditLog server-side; company-scoped).
    audit: {
      list: async (eventType?: string) => apiFetch(`${BASE_URL}/communication/audit${eventType ? `?eventType=${encodeURIComponent(eventType)}` : ''}`, { headers: getHeaders() }),
      log: async (data: any) => apiFetch(`${BASE_URL}/communication/audit`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    },
    // ── Enterprise Communication Workflow ────────────────────────────────────
    eventMappings: async () => apiFetch(`${BASE_URL}/communication/event-mappings`, { headers: getHeaders() }),
    saveEventMapping: async (eventKey: string, data: any) => apiFetch(`${BASE_URL}/communication/event-mappings/${encodeURIComponent(eventKey)}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
    mappingValidation: async () => apiFetch(`${BASE_URL}/communication/event-mappings/validation`, { headers: getHeaders() }),
    health: async () => apiFetch(`${BASE_URL}/communication/health`, { headers: getHeaders() }),
    copyFromMaster: async (masterId: any) => apiFetch(`${BASE_URL}/communication/templates/copy-from-master/${masterId}`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({}) }),
    setLibraryState: async (id: any, libraryState: string) => apiFetch(`${BASE_URL}/communication/templates/${id}/library-state`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ libraryState }) }),
    master: {
      list: async (category?: string) => apiFetch(`${BASE_URL}/communication-master${category ? `?category=${encodeURIComponent(category)}` : ''}`, { headers: getHeaders() }),
      categories: async () => apiFetch(`${BASE_URL}/communication-master/categories`, { headers: getHeaders() }),
      stats: async () => apiFetch(`${BASE_URL}/communication-master/stats`, { headers: getHeaders() }),
      seed: async (force?: boolean) => apiFetch(`${BASE_URL}/communication-master/seed${force ? '?force=true' : ''}`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({}) }),
      create: async (data: any) => apiFetch(`${BASE_URL}/communication-master`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
      update: async (id: any, data: any) => apiFetch(`${BASE_URL}/communication-master/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }),
      remove: async (id: any) => apiFetch(`${BASE_URL}/communication-master/${id}`, { method: 'DELETE', headers: getHeaders() }),
    },
  },

  statistics: {
    // Live, database-driven Super Admin KPI counts (single source of truth).
    getSuperAdmin: async () => {
      return await apiFetch(`${BASE_URL}/statistics/super-admin`, { headers: getHeaders() });
    },
    // SaaS platform analytics for the Super Admin Reports module (counts/revenue/
    // growth only — no company-operational or employee PII).
    getPlatformReports: async () => {
      return await apiFetch(`${BASE_URL}/statistics/platform-reports`, { headers: getHeaders() });
    },
    // Read-only, no-PII monitoring summary for one company (Company Overview).
    getCompanyOverview: async (companyId: string | number) => {
      return await apiFetch(`${BASE_URL}/statistics/company-overview/${companyId}`, { headers: getHeaders() });
    }
  },

  // Support Sessions — the only audited way a Super Admin enters a company's HR
  // environment. Super Admin only (backend-gated).
  supportSessions: {
    active: async () => apiFetch(`${BASE_URL}/support-sessions/active`, { headers: getHeaders() }),
    start: async (data: { companyId: string | number; reason: string; ticketNumber?: string }) =>
      apiFetch(`${BASE_URL}/support-sessions`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
    end: async () => apiFetch(`${BASE_URL}/support-sessions/end`, { method: 'POST', headers: getHeaders() }),
    list: async (companyId?: string | number) =>
      apiFetch(`${BASE_URL}/support-sessions${companyId ? `?companyId=${companyId}` : ''}`, { headers: getHeaders() }),
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

  // First-login onboarding (company accounts): welcome gate + sample workspace,
  // plus a company-readable plan catalog for the View Plans screen.
  onboarding: {
    status: async () => { return await apiFetch(`${BASE_URL}/onboarding/status`, { headers: getHeaders() }); },
    choose: async (choice: 'blank' | 'sample' | 'cancelled') => { return await apiFetch(`${BASE_URL}/onboarding/choose`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ choice }) }); },
    plans: async () => { return await apiFetch(`${BASE_URL}/onboarding/plans`, { headers: getHeaders() }); },
    loadSample: async () => { return await apiFetch(`${BASE_URL}/onboarding/load-sample`, { method: 'POST', headers: getHeaders(), body: '{}' }); },
    removeSample: async () => { return await apiFetch(`${BASE_URL}/onboarding/remove-sample`, { method: 'POST', headers: getHeaders(), body: '{}' }); },
  },

  // Super Admin Subscription Management.
  subscriptions: {
    dashboard: async () => { return await apiFetch(`${BASE_URL}/subscriptions/dashboard`, { headers: getHeaders() }); },
    catalog: async () => { return await apiFetch(`${BASE_URL}/subscriptions/catalog`, { headers: getHeaders() }); },
    list: async () => { return await apiFetch(`${BASE_URL}/subscriptions`, { headers: getHeaders() }); },
    get: async (companyId: string | number) => { return await apiFetch(`${BASE_URL}/subscriptions/${companyId}`, { headers: getHeaders() }); },
    update: async (companyId: string | number, data: any) => { return await apiFetch(`${BASE_URL}/subscriptions/${companyId}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    suspend: async (companyId: string | number, reason?: string) => { return await apiFetch(`${BASE_URL}/subscriptions/${companyId}/suspend`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ reason }) }); },
    activate: async (companyId: string | number, reason?: string) => { return await apiFetch(`${BASE_URL}/subscriptions/${companyId}/activate`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ reason }) }); },
    history: async (companyId: string | number) => { return await apiFetch(`${BASE_URL}/subscriptions/${companyId}/history`, { headers: getHeaders() }); },
    allHistory: async () => { return await apiFetch(`${BASE_URL}/subscriptions/history/all`, { headers: getHeaders() }); },
    billing: async () => { return await apiFetch(`${BASE_URL}/subscriptions/billing/all`, { headers: getHeaders() }); },
  },

  // Editable plan master configuration (Subscription Plans tab) — the source of
  // truth for what each plan unlocks. Editing here re-permissions companies live.
  planConfig: {
    list: async () => { return await apiFetch(`${BASE_URL}/plan-config`, { headers: getHeaders() }); },
    metadata: async () => { return await apiFetch(`${BASE_URL}/plan-config/metadata`, { headers: getHeaders() }); },
    getSettings: async () => { return await apiFetch(`${BASE_URL}/plan-config/settings`, { headers: getHeaders() }); },
    updateSettings: async (data: any) => { return await apiFetch(`${BASE_URL}/plan-config/settings`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/plan-config`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (key: string, data: any) => { return await apiFetch(`${BASE_URL}/plan-config/${encodeURIComponent(key)}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    remove: async (key: string) => { return await apiFetch(`${BASE_URL}/plan-config/${encodeURIComponent(key)}`, { method: 'DELETE', headers: getHeaders() }); },
  },

  // Super Admin Subscription Billing — real GST invoices per company subscription.
  subscriptionInvoices: {
    // Issuer/branding/bank/signature config for the subscription invoice document.
    getSettings: async () => { return await apiFetch(`${BASE_URL}/subscription-invoices/settings`, { headers: getHeaders() }); },
    updateSettings: async (data: any) => { return await apiFetch(`${BASE_URL}/subscription-invoices/settings`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    dashboard: async () => { return await apiFetch(`${BASE_URL}/subscription-invoices/dashboard`, { headers: getHeaders() }); },
    reports: async () => { return await apiFetch(`${BASE_URL}/subscription-invoices/reports`, { headers: getHeaders() }); },
    list: async (params: Record<string, any> = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '' && v !== 'all') q.append(k, String(v)); });
      const qs = q.toString();
      return await apiFetch(`${BASE_URL}/subscription-invoices${qs ? `?${qs}` : ''}`, { headers: getHeaders() });
    },
    get: async (id: string | number) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}`, { headers: getHeaders() }); },
    companyBilling: async (companyId: string | number) => { return await apiFetch(`${BASE_URL}/subscription-invoices/company/${companyId}`, { headers: getHeaders() }); },
    preview: async (data: any) => { return await apiFetch(`${BASE_URL}/subscription-invoices/preview`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    generate: async (data: any) => { return await apiFetch(`${BASE_URL}/subscription-invoices`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string | number, data: any) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    remove: async (id: string | number) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    setStatus: async (id: string | number, data: any) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}/status`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    payments: async (id: string | number) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}/payments`, { headers: getHeaders() }); },
    /** Every payment received across all invoices (Billing → Payments register). */
    allPayments: async (limit = 500) => { return await apiFetch(`${BASE_URL}/subscription-invoices/payments?limit=${limit}`, { headers: getHeaders() }); },
    addPayment: async (id: string | number, data: any) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}/payments`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    duplicate: async (id: string | number) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}/duplicate`, { method: 'POST', headers: getHeaders() }); },
    regenerate: async (id: string | number) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}/regenerate`, { method: 'POST', headers: getHeaders() }); },
    renew: async (id: string | number) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}/renew`, { method: 'POST', headers: getHeaders() }); },
    email: async (id: string | number, data: any = {}) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}/email`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    // ── Interactive Invoice Editor (Super Admin) ──
    getEditor: async (id: string | number) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}/editor`, { headers: getHeaders() }); },
    saveEditor: async (id: string | number, data: any) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}/editor`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    finalize: async (id: string | number, data: any = {}) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}/finalize`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    unlock: async (id: string | number, data: any) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}/unlock`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    editorAudit: async (id: string | number) => { return await apiFetch(`${BASE_URL}/subscription-invoices/${id}/audit`, { headers: getHeaders() }); },
    // Authenticated fetch of the server-rendered A4 invoice HTML (for on-screen
    // preview via iframe srcDoc + print/PDF). Returns the raw HTML string.
    fetchHtml: async (id: string | number): Promise<string> => {
      const r = await fetch(`${BASE_URL}/subscription-invoices/${id}/html`, { headers: getHeaders() });
      if (!r.ok) throw new Error('Failed to load invoice document');
      return await r.text();
    },
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
    /**
     * The audiences/branches/departments/roles/employees the CALLER may target.
     * The broadcast UI renders this verbatim and derives nothing itself, so a
     * branch user is never offered a cross-branch option. The same server-side
     * scope backs the send endpoint, so the menu and the rule cannot drift.
     */
    broadcastOptions: async (companyId?: any) => {
      const qs = companyId ? `?companyId=${encodeURIComponent(String(companyId))}` : '';
      return await apiFetch(`${BASE_URL}/notifications/broadcast-options${qs}`, { headers: getHeaders() });
    },
    /** Send one message to a resolved audience. Resolves only after the rows are committed. */
    broadcast: async (data: {
      message: string; title?: string; priority?: string;
      audience: 'all' | 'branch' | 'role' | 'department' | 'employee';
      role?: string; department?: string; branchId?: any; employeeId?: any; companyId?: any;
    }) => { return await apiFetch(`${BASE_URL}/notifications/broadcast`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/notifications/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/notifications/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    markRead: async (id: any) => { return await apiFetch(`${BASE_URL}/notifications/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ read: true }) }); },
    markAllRead: async () => { return await apiFetch(`${BASE_URL}/notifications/read-all`, { method: 'PUT', headers: getHeaders() }); },
    deleteMany: async (ids: any[]) => { return await apiFetch(`${BASE_URL}/notifications/delete-many`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ ids }) }); },
    clearAll: async () => { return await apiFetch(`${BASE_URL}/notifications/clear-all`, { method: 'DELETE', headers: getHeaders() }); }
  },

  payroll: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/payroll`, { headers: getHeaders() }); },
    getPaginated: async (params: Record<string, any>) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          query.append(key, String(value));
        }
      });
      return await apiFetch(`${BASE_URL}/payroll?${query.toString()}`, { headers: getHeaders() });
    },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/payroll`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    // Generate payroll via the SINGLE backend engine (recalcOne) — salary is
    // prorated from the synchronized AttendanceSummary (gross = dailyRate ×
    // payableDays). Replaces the old client-side automation engine so there is
    // exactly one payroll calculation everywhere.
    generate: async (data: { companyId?: any; branchId?: any; month: string; year: number; role?: string; employeeIds?: any[] }) => { return await apiFetch(`${BASE_URL}/payroll/generate`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
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
      // Active deduction components for a company (built-ins + Component Builder).
      // Lets a Draft worksheet render every applicable deduction row at ₹0 so the
      // section is never empty. Reads the existing endpoint — no API change.
      deductionComponents: async (companyId?: any) => { const p = new URLSearchParams(); if (companyId != null && companyId !== '') p.append('companyId', String(companyId)); return await apiFetch(`${BASE_URL}/payroll/deduction-components?${p.toString()}`, { headers: getHeaders() }); },
    }
  },

  attendanceSummary: {
    getAll: async (month?: string, year?: number, includeComputed?: boolean) => {
      const p = new URLSearchParams();
      if (month) p.append('month', month);
      if (year) p.append('year', String(year));
      // includeComputed → also return LIVE attendance for employees with raw
      // rows but no materialized summary (so Payroll reads the Attendance
      // module's real numbers, never a missing/empty cache). Off by default so
      // the Attendance page keeps getting only persisted, editable rows.
      if (includeComputed) p.append('includeComputed', 'true');
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
    /**
     * Full attendance reports — the "View Full Report" destinations.
     * Both are projections of ONE server-side aggregate, so their totals always
     * agree with each other and with the dashboard cards. Scope, branch
     * confinement and the range are all enforced server-side.
     */
    workforceReport: async (params: { companyId: any; from?: string; to?: string; branchId?: any; department?: string }) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.append(k, String(v)); });
      return await apiFetch(`${BASE_URL}/attendance/workforce-report?${qs.toString()}`, { headers: getHeaders() });
    },
    departmentReport: async (params: { companyId: any; from?: string; to?: string; branchId?: any; department?: string }) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.append(k, String(v)); });
      return await apiFetch(`${BASE_URL}/attendance/department-report?${qs.toString()}`, { headers: getHeaders() });
    },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/attendance`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/attendance/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/attendance/${id}`, { method: 'DELETE', headers: getHeaders() }); },
    syncPayroll: async (data: { companyId?: string; month: number; year: number; scopeIds?: string[]; dryRun?: boolean; snapshotOnly?: boolean; markSynced?: boolean }) => {
      return await apiFetch(`${BASE_URL}/attendance/sync-payroll`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) });
    },
    // Push to Payroll Engine — transfer the finalized attendance calculation into
    // the Payroll module (creates payroll records verbatim; NO recalculation).
    pushToPayroll: async (data: { companyId?: string; month: string | number; year: number; rows: any[]; replace?: boolean }) => {
      return await apiFetch(`${BASE_URL}/attendance/push-to-payroll`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) });
    }
  },

  overtime: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/overtime`, { headers: getHeaders() }); },
    // One row per employee. Grouped server-side from the same records getAll
    // returns, so the totals HR approves against come from the database rather
    // than from whichever page the table happens to be showing.
    summary: async () => { return await apiFetch(`${BASE_URL}/overtime/summary`, { headers: getHeaders() }); },
    pushToPayroll: async (employeeId: number | string, period?: { month: string; year: number }) => {
      return await apiFetch(`${BASE_URL}/overtime/push-to-payroll`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ employeeId, ...(period || {}) }),
      });
    },
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
  },

  // Attendance & Salary Deduction Policy — the master attendance→salary calc
  // config (backend deduction_policy table). Read by the payroll engine.
  deductionPolicy: {
    get: async () => { return await apiFetch(`${BASE_URL}/deduction-policy`, { headers: getHeaders() }); },
    versions: async (branchLevel = false) => { return await apiFetch(`${BASE_URL}/deduction-policy/versions${branchLevel ? '?branchLevel=true' : ''}`, { headers: getHeaders() }); },
    save: async (data: { config: any; enabled?: boolean; reason?: string; branchLevel?: boolean }) => { return await apiFetch(`${BASE_URL}/deduction-policy`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    recalculate: async (data: { month?: string; year?: number } = {}) => { return await apiFetch(`${BASE_URL}/deduction-policy/recalculate`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); }
  }
};
