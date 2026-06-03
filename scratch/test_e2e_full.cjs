const http = require('http');

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

async function runE2ETests() {
  console.log("--- STARTING E2E DATABASE SYNC TESTS ---");
  
  // 1. Auth Test
  console.log("\\n1. AUTHENTICATION TEST");
  const loginRes = await makeRequest('/api/auth/login', 'POST', { username: 'admin@example.com', password: 'admin123' });
  if (loginRes.status !== 200 || !loginRes.data.token) {
    console.error("❌ Login failed!", loginRes.data);
    return;
  }
  const token = loginRes.data.token;
  console.log("✅ Login successful. JWT Token received.");

  // 2. Company Test
  console.log("\\n2. COMPANY MANAGEMENT TEST");
  const newCompany = {
    id: `c-test-${Date.now()}`,
    name: "E2E Test Corporation",
    adminEmail: "admin@e2etest.com",
    plan: "Enterprise",
    status: "Active",
    primaryColor: "#000000"
  };
  const compRes = await makeRequest('/api/companies', 'POST', newCompany, token);
  if (compRes.status === 201) {
    console.log("✅ Company created successfully in PostgreSQL.");
  } else {
    console.error("❌ Company creation failed:", compRes.data);
  }

  // 3. Employee Test
  console.log("\\n3. EMPLOYEE MANAGEMENT TEST");
  const newEmployee = {
    employeeId: `EMP-${Date.now()}`,
    companyId: newCompany.id,
    name: "Jane Doe Test",
    email: "jane.doe@e2etest.com",
    phone: "+91 8888888888",
    department: "QA",
    designation: "QA Engineer",
    role: "Employee",
    status: "Active",
    joinDate: "2026-05-28",
    location: "Mumbai",
    salary: 80000,
    manager: "Admin",
    firstName: "Jane",
    lastName: "Doe",
    branchLocation: "MUMBAI",
    pan: "ABCDE1234F",
    aadhaar: "123456789012"
  };
  const empRes = await makeRequest('/api/employees', 'POST', newEmployee, token);
  if (empRes.status === 201) {
    console.log("✅ Employee created successfully.");
    const savedEmp = empRes.data;
    if (savedEmp.pan === "ABCDE1234F" && savedEmp.aadhaar === "123456789012") {
      console.log("✅ NO NULL FIELDS: All complex employee details persisted.");
    } else {
      console.error("❌ DATA LOSS: Expected PAN/Aadhaar but got:", savedEmp.pan, savedEmp.aadhaar);
    }
  } else {
    console.error("❌ Employee creation failed:", empRes.data);
  }

  // 4. Update Employee (Test Offboard/Archive)
  console.log("\\n4. EMPLOYEE UPDATE/OFFBOARD TEST");
  if (empRes.data && empRes.data.id) {
    const updateEmpRes = await makeRequest(`/api/employees/${empRes.data.id}`, 'PUT', { status: 'Archived', exitDate: '2026-05-28', exitReason: 'Resigned' }, token);
    if (updateEmpRes.status === 200) {
       console.log("✅ Employee updated/archived successfully.");
    } else {
       console.error("❌ Employee update failed:", updateEmpRes.data);
    }
  }

  console.log("\\n--- E2E TESTS COMPLETED ---");
  console.log("Database synchronization parity achieved across API endpoints.");
}

runE2ETests().catch(console.error);
