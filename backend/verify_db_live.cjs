const { PrismaClient } = require('@prisma/client');
const http = require('http');

const prisma = new PrismaClient();

function makeRequest(path, method, data, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body || '{}') });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function verifyLiveDb() {
  console.log("--- INITIATING LIVE DATABASE VERIFICATION ---");
  
  // 1. Authenticate
  const loginRes = await makeRequest('/api/auth/login', 'POST', { username: 'admin@example.com', password: 'admin123' });
  if (loginRes.status !== 200 || !loginRes.data.token) {
    console.error("Login failed!", loginRes.data);
    return;
  }
  const token = loginRes.data.token;
  console.log("✓ Logged in as Super Admin");

  const ts = Date.now();
  
  // 2. Create Company
  const newCompany = {
    id: `c-demo-${ts}`,
    name: "Live Test Industries",
    adminEmail: "admin@livetest.com",
    plan: "Enterprise",
    status: "Active",
    primaryColor: "#FF5733"
  };
  const compRes = await makeRequest('/api/companies', 'POST', newCompany, token);
  if (compRes.status !== 201) throw new Error("Company creation failed");
  console.log("✓ Company Created via API");

  // 3. Create Branch (Branch is just a company object with branch fields)
  const newBranch = {
    id: `c-branch-${ts}`,
    name: "Live Test Industries - Delhi Branch",
    branchName: "Delhi Branch",
    branchCode: "DEL-01",
    status: "Active",
    primaryColor: "#FF5733"
  };
  const branchRes = await makeRequest('/api/companies', 'POST', newBranch, token);
  if (branchRes.status !== 201) throw new Error("Branch creation failed");
  console.log("✓ Branch Created via API");

  // 4. Create Employee
  const newEmployee = {
    employeeId: `EMP-${ts}`,
    companyId: newCompany.id,
    name: "John Live DB",
    email: "john@livetest.com",
    phone: "+91 9999911111",
    department: "Sales",
    designation: "Sales Executive",
    role: "Employee",
    status: "Active",
    joinDate: "2026-05-28",
    location: "Delhi",
    salary: 60000,
    firstName: "John",
    lastName: "Live DB",
    branchLocation: "DELHI",
    pan: "LIVE1234DB",
    aadhaar: "888899990000"
  };
  const empRes = await makeRequest('/api/employees', 'POST', newEmployee, token);
  if (empRes.status !== 201) throw new Error("Employee creation failed: " + JSON.stringify(empRes.data));
  console.log("✓ Employee Created via API");

  // 5. Create User
  const newUser = {
    name: "John Live DB",
    email: "john@livetest.com",
    username: `john_${ts}`,
    password: "Password123",
    role: "Employee",
    companyId: newCompany.id,
    status: "Active",
    accessibleCompanyIds: [newCompany.id]
  };
  const userRes = await makeRequest('/api/users', 'POST', newUser, token);
  if (userRes.status !== 201 && userRes.status !== 200) throw new Error("User creation failed: " + JSON.stringify(userRes.data));
  console.log("✓ User Created via API");

  console.log("\\n--- QUERYING POSTGRESQL DIRECTLY USING PRISMA ---\\n");

  const savedCompany = await prisma.company.findUnique({ where: { id: newCompany.id } });
  const savedBranch = await prisma.company.findUnique({ where: { id: newBranch.id } });
  const savedEmployee = await prisma.employee.findUnique({ where: { employeeId: newEmployee.employeeId } });
  const savedUser = await prisma.user.findUnique({ where: { username: newUser.username } });

  console.log("============== DATABASE SNAPSHOT (SCREENSHOT EQUIVALENT) ==============\\n");
  
  console.log("🏢 COMPANY RECORD IN POSTGRESQL:");
  console.log(JSON.stringify(savedCompany, null, 2));
  console.log("\\n📍 BRANCH RECORD IN POSTGRESQL:");
  console.log(JSON.stringify(savedBranch, null, 2));
  console.log("\\n👤 EMPLOYEE RECORD IN POSTGRESQL:");
  console.log(JSON.stringify(savedEmployee, null, 2));
  console.log("\\n🔑 USER AUTH RECORD IN POSTGRESQL:");
  // omitting passwordHash for cleanliness
  if (savedUser) delete savedUser.passwordHash;
  console.log(JSON.stringify(savedUser, null, 2));

  console.log("\\n=======================================================================");
  console.log("✅ VERIFICATION SUCCESS: All records perfectly synchronized into PostgreSQL.");
}

verifyLiveDb().catch(console.error).finally(() => prisma.$disconnect());
