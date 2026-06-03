const { getAll } = require('./src/controllers/payrollController');

const req = {
  query: {},
  headers: { 'x-workspace-id': 'c-siddhpur' },
  user: {
    id: 'user-id',
    role: 'HR',
    companyId: 'c-gcri',
    accessibleCompanyIds: ['c-ahmedabad', 'c-rajkot', 'c-bhavnagar', 'c-siddhpur']
  }
};

const res = {
  json: (data) => console.log('Returned:', data.length),
  status: (code) => ({ json: (data) => console.log('Error:', code, data) })
};

getAll(req, res);
