import { Company, UserAccount } from '../data/mockData';

const BASE_URL = 'http://localhost:5000/api';

const getHeaders = () => {
  const token = localStorage.getItem('hrms_jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export const api = {
  auth: {
    login: async (credentials: any) => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(credentials)
      });
      if (!res.ok) throw new Error('Login failed');
      return res.json();
    },
    getMe: async () => {
      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch user');
      return res.json();
    }
  },
  
  companies: {
    getAll: async () => {
      const res = await fetch(`${BASE_URL}/companies`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to fetch companies');
      return res.json();
    },
    create: async (data: Partial<Company>) => {
      const res = await fetch(`${BASE_URL}/companies`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to create company');
      return res.json();
    },
    update: async (id: string, data: Partial<Company>) => {
      const res = await fetch(`${BASE_URL}/companies/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to update company');
      return res.json();
    },
    archive: async (id: string) => {
      const res = await fetch(`${BASE_URL}/companies/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to archive company');
      return res.json();
    }
  },

  branches: {
    getAll: async () => {
      const res = await fetch(`${BASE_URL}/branches`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to fetch branches');
      return res.json();
    },
    create: async (data: any) => {
      const res = await fetch(`${BASE_URL}/branches`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to create branch');
      return res.json();
    }
  },

  employees: {
    getAll: async () => {
      const res = await fetch(`${BASE_URL}/employees`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to fetch employees');
      return res.json();
    },
    create: async (data: any) => {
      const res = await fetch(`${BASE_URL}/employees`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to create employee');
      return res.json();
    },
    update: async (id: string, data: any) => {
      const res = await fetch(`${BASE_URL}/employees/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to update employee');
      return res.json();
    },
    archive: async (id: string) => {
      const res = await fetch(`${BASE_URL}/employees/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to archive employee');
      return res.json();
    }
  }
};
