const http = require('http');

async function test() {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: 'default123' })
  });
  const loginData = await loginRes.json();
  const headers = { 'Authorization': `Bearer ${loginData.token}` };

  const branches = await fetch('http://localhost:5000/api/branches', { headers });
  const branchesData = await branches.json();
  console.log('Branches:', branchesData.map(b => b.id + ' : ' + b.branchName));
}

test().catch(console.error);
