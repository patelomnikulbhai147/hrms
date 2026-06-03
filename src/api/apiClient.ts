import { Company, UserAccount } from '../types';

const BASE_URL = 'http://localhost:5000/api';

const getHeaders = () => {
  const token = localStorage.getItem('hrms_jwt_token');
  const workspaceId = localStorage.getItem('hrms_active_company_id');
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(workspaceId ? { 'x-workspace-id': workspaceId } : {})
  };
};

async function apiFetch(url: string, options?: RequestInit) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      let msg = 'API request failed';
      try {
        const errorData = await res.json();
        msg = errorData.error || errorData.message || msg;
      } catch (e) {
        msg = res.statusText || msg;
      }
      throw new Error(msg);
    }
    return await res.json();
  } catch (err: any) {
    console.error('API Client Error:', err);
    throw new Error(err.message || 'Network or Server Error');
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
    archive: async (id: string) => {
      return await apiFetch(`${BASE_URL}/companies/${id}`, {
        method: 'DELETE',
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
      return await apiFetch(`${BASE_URL}/branches/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
    }
  },

  employees: {
    getAll: async () => {
      return await apiFetch(`${BASE_URL}/employees`, { headers: getHeaders() });
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
    }
  },

  leaves: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/leaves`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/leaves`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/leaves/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/leaves/${id}`, { method: 'DELETE', headers: getHeaders() }); }
  },

  documents: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/documents`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/documents`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/documents/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/documents/${id}`, { method: 'DELETE', headers: getHeaders() }); }
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
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/notifications/${id}`, { method: 'DELETE', headers: getHeaders() }); }
  },

  payroll: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/payroll`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/payroll`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/payroll/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/payroll/${id}`, { method: 'DELETE', headers: getHeaders() }); }
  },

  attendance: {
    getAll: async () => { return await apiFetch(`${BASE_URL}/attendance`, { headers: getHeaders() }); },
    create: async (data: any) => { return await apiFetch(`${BASE_URL}/attendance`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }); },
    update: async (id: string, data: any) => { return await apiFetch(`${BASE_URL}/attendance/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }); },
    delete: async (id: string) => { return await apiFetch(`${BASE_URL}/attendance/${id}`, { method: 'DELETE', headers: getHeaders() }); }
  }
};
