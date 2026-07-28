const jwt = require('jsonwebtoken');

const JWT_SECRET = 'enterprise_hrms_super_secret_key_2026'; // from .env
const payload = { id: 1, email: 'admin@company.com', role: 'Super Admin', companyId: 1, name: 'Admin' };
const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

async function testApi() {
  try {
    const res = await fetch('http://localhost:5000/api/bank/verify-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ifsc: 'HDFC0001234',
        accountNumber: '112233445566',
        employeeId: 311,
        companyId: 1,
        employeeName: 'Priya Ranjan Patel'
      })
    });
    
    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}
testApi();
