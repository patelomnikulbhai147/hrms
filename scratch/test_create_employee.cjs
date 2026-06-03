const http = require('http');

async function test() {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: 'default123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  console.log('--- Creating Employee ---');
  const createPayload = {
    employeeId: `TEST-EMP-${Date.now()}`,
    companyId: 'c-gcri',
    branchId: 'c-ahmedabad',
    name: 'Auto Test Employee',
    email: `autotest${Date.now()}@test.com`,
    phone: '+91 9999999999',
    department: 'Nursing',
    designation: 'Staff Nurse',
    role: 'Staff',
    status: 'Active',
    joinDate: new Date().toISOString(),
    location: 'Ahmedabad, Gujarat',
    salary: 32000,
    firstName: 'Auto',
    lastName: 'Test',
    aadhaarName: 'Auto Test Employee',
    gender: 'Female',
    dob: '1998-08-10',
    maritalStatus: 'UNMARRIED',
    nationality: 'INDIAN',
    fatherSpouseName: 'TEST FATHER',
    relationType: 'FATHER',
    category: 'Skilled',
    employmentType: 'CONTRACTUAL',
    branchLocation: 'AHMEDABAD',
    aadhaar: '123412341234',
    pan: 'ABCDE1234F',
    bankName: 'STATE BANK OF INDIA',
    accountNumber: '12345678901',
    ifsc: 'SBIN0060437',
    presentAddress: 'Test Address',
    permanentAddress: 'Test Address'
  };

  const createRes = await fetch('http://localhost:5000/api/employees', {
    method: 'POST',
    headers,
    body: JSON.stringify(createPayload)
  });
  const createData = await createRes.json();
  console.log('Created Employee:', createData.id, createData.name);

  // Fetch all to see if it's there
  const emps = await fetch('http://localhost:5000/api/employees', { headers });
  const empsData = await emps.json();
  const created = empsData.find(e => e.id === createData.id);
  console.log('Exists in employee list:', !!created);
  
  // Payroll 
  const payroll = await fetch('http://localhost:5000/api/payroll', { headers });
  const payrollData = await payroll.json();
  const createdPayroll = payrollData.find(p => p.employeeId === createData.id);
  console.log('Payroll for new employee:', createdPayroll ? `Found (Net Salary: ${createdPayroll.netSalary})` : 'Missing');
}

test().catch(console.error);
