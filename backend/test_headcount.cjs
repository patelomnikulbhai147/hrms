const { PrismaClient } = require('@prisma/client');
const http = require('http');

const prisma = new PrismaClient();

const makeRequest = (path, method, data, token) => new Promise((resolve, reject) => {
  const req = http.request({
    hostname: 'localhost',
    port: 5000,
    path: path,
    method: method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(JSON.stringify(data)) } : {})
    }
  }, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
  });
  req.on('error', reject);
  if (data) req.write(JSON.stringify(data));
  req.end();
});

(async () => {
  try {
    const loginRes = await makeRequest('/api/auth/login', 'POST', { username: 'superadmin', password: 'default123' });
    const token = loginRes.body.token;

    // Get branches before
    const branchesBefore = await makeRequest('/api/branches', 'GET', null, token);
    const gcriBranch = branchesBefore.body.find(b => b.branchName === 'GCRI Head Office' || b.companyId === 'c-gcri');
    const branchId = gcriBranch ? gcriBranch.id : branchesBefore.body[0].id;
    const countBefore = gcriBranch ? gcriBranch.headcount : branchesBefore.body[0].headcount;
    
    console.log(`Branch ID: ${branchId}`);
    console.log(`Headcount Before: ${countBefore}`);

    // Create Employee
    const uniqueId = Math.floor(Math.random() * 10000);
    const empData = {
      employeeId: `EMP-${uniqueId}`,
      companyId: 'c-gcri',
      branchId: branchId,
      name: `Test Emp ${uniqueId}`,
      email: `emp${uniqueId}@gcri.com`,
      department: 'IT',
      designation: 'Developer',
      status: 'Active',
      joinDate: new Date().toISOString()
    };
    
    const createRes = await makeRequest('/api/employees', 'POST', empData, token);
    if (createRes.status !== 201) throw new Error(`Create employee failed: ${JSON.stringify(createRes.body)}`);
    console.log('Employee created successfully.');
    
    // Get branches after
    const branchesAfter = await makeRequest('/api/branches', 'GET', null, token);
    const branchAfter = branchesAfter.body.find(b => b.id === branchId);
    const countAfter = branchAfter.headcount;
    
    console.log(`Headcount After: ${countAfter}`);
    
    if (countAfter === countBefore + 1) {
      console.log('✅ Dynamic Headcount successfully validated!');
    } else {
      console.log('❌ Headcount did not increment dynamically.');
    }

    // Clean up
    await makeRequest(`/api/employees/${createRes.body.id}`, 'DELETE', null, token);
    
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await prisma.$disconnect();
  }
})();
