const http = require('http');

async function test() {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: 'default123' }) // Super Admin
  });
  const loginData = await loginRes.json();
  if (!loginData.token) {
    console.error('Login failed:', loginData);
    return;
  }
  const token = loginData.token;
  console.log('Login successful:', loginData.user.name);

  const headers = { 'Authorization': `Bearer ${token}` };

  const getMe = await fetch('http://localhost:5000/api/auth/me', { headers });
  const me = await getMe.json();
  console.log('Me accessible branches:', me.accessibleCompanyIds?.length);

  const emps = await fetch('http://localhost:5000/api/employees', { headers });
  const empsData = await emps.json();
  console.log('Employees total:', empsData.length);
  
  const payroll = await fetch('http://localhost:5000/api/payroll', { headers });
  const payrollData = await payroll.json();
  console.log('Payroll total:', payrollData.length);
  const zeroSalary = payrollData.filter(p => p.basicSalary === 0 || p.netSalary === 0);
  console.log('Payroll with zero values:', zeroSalary.length);
  
  const companies = await fetch('http://localhost:5000/api/companies', { headers });
  const companiesData = await companies.json();
  console.log('Companies:', companiesData.length, 'Headcount sum:', companiesData.reduce((acc, c) => acc + c.headcount, 0));
  
  const branches = await fetch('http://localhost:5000/api/branches', { headers });
  const branchesData = await branches.json();
  console.log('Branches:', branchesData.length, 'Headcount sum:', branchesData.reduce((acc, b) => acc + b.headcount, 0));
}

test().catch(console.error);
