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
    console.log('--- TESTING TENANT ISOLATION ---');

    // 1. Create a mock company if needed
    const companyA = await prisma.company.upsert({
      where: { id: 'c-test-A' },
      update: {},
      create: { id: 'c-test-A', name: 'Test Company A', isHeadOffice: true }
    });
    const companyB = await prisma.company.upsert({
      where: { id: 'c-test-B' },
      update: {},
      create: { id: 'c-test-B', name: 'Test Company B', isHeadOffice: true }
    });

    // 2. Create users for these companies
    const userA = await prisma.user.upsert({
      where: { username: 'test_head_a' },
      update: { passwordHash: '$2a$10$xyz123', companyId: companyA.id }, // mock hash, won't use it to login, will use API
      create: { name: 'Head A', email: 'a@a.com', username: 'test_head_a', passwordHash: 'will_be_set_by_api', role: 'Company Head', companyId: companyA.id }
    });

    // 3. Login as super admin to create proper test users and employees
    const superlogin = await makeRequest('/api/auth/login', 'POST', { username: 'superadmin', password: 'default123' });
    const superToken = superlogin.body.token;

    // Reset password of User A so we can login
    await makeRequest(`/api/users/${userA.id}/reset-password`, 'PUT', { newPassword: 'password123' }, superToken);

    // 4. Create an employee in Company A
    await makeRequest('/api/employees', 'POST', {
      employeeId: `EMP-A-${Math.random()}`,
      companyId: companyA.id,
      name: 'Employee A',
      email: 'empa@test.com',
      department: 'IT',
      designation: 'Dev',
      status: 'Active',
      joinDate: new Date()
    }, superToken);

    // 5. Create an employee in Company B
    await makeRequest('/api/employees', 'POST', {
      employeeId: `EMP-B-${Math.random()}`,
      companyId: companyB.id,
      name: 'Employee B',
      email: 'empb@test.com',
      department: 'IT',
      designation: 'Dev',
      status: 'Active',
      joinDate: new Date()
    }, superToken);

    // 6. Login as User A (Company A Head)
    console.log('Logging in as Company Head for Company A...');
    const loginA = await makeRequest('/api/auth/login', 'POST', { username: 'test_head_a', password: 'password123' });
    if (loginA.status !== 200) throw new Error('Failed to login as User A');
    const tokenA = loginA.body.token;

    // 7. Fetch employees
    console.log('Fetching employees for Company A...');
    const emps = await makeRequest('/api/employees', 'GET', null, tokenA);
    
    // 8. Verify isolation
    let hasEmpA = false;
    let hasEmpB = false;
    
    for (const emp of emps.body) {
      if (emp.companyId === companyA.id) hasEmpA = true;
      if (emp.companyId === companyB.id) hasEmpB = true;
    }

    if (hasEmpA && !hasEmpB) {
      console.log('✅ TENANT ISOLATION SUCCESSFUL! Company Head A only sees Company A employees.');
    } else {
      console.error('❌ TENANT ISOLATION FAILED!');
      console.log('Saw Company A:', hasEmpA);
      console.log('Saw Company B:', hasEmpB);
    }
    
    // Also verify Super Admin sees both
    const superEmps = await makeRequest('/api/employees', 'GET', null, superToken);
    let superHasEmpA = false;
    let superHasEmpB = false;
    for (const emp of superEmps.body) {
      if (emp.companyId === companyA.id) superHasEmpA = true;
      if (emp.companyId === companyB.id) superHasEmpB = true;
    }
    if (superHasEmpA && superHasEmpB) {
      console.log('✅ SUPER ADMIN ISOLATION SUCCESSFUL! Super Admin sees both companies.');
    } else {
      console.error('❌ SUPER ADMIN FAILED!');
    }

  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await prisma.$disconnect();
  }
})();
