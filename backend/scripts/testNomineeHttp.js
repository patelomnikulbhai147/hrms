// Test the REAL HTTP stack (protect -> readOnly -> controller -> DB) for nominee save.
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');

const BASE = 'http://localhost:5000/api';
const EMP = 799;

(async () => {
  const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-workspace-id': '1' };

  await prisma.$executeRawUnsafe("DELETE FROM employee_nominees WHERE employeeId = ? AND fullName = 'HTTP Test'", EMP);

  // CREATE
  const createRes = await fetch(`${BASE}/nominees`, { method: 'POST', headers: H, body: JSON.stringify({ employeeId: EMP, fullName: 'HTTP Test', relationship: 'Father', mobile: '9876543210', dob: '1980-01-01', percentage: 100 }) });
  console.log('CREATE status:', createRes.status);
  console.log('CREATE body  :', await createRes.text());

  // LIST (refresh)
  const listRes = await fetch(`${BASE}/nominees?employeeId=${EMP}`, { headers: H });
  const list = await listRes.json();
  const found = (list.nominees || []).find(n => n.fullName === 'HTTP Test');
  console.log('LIST status  :', listRes.status, '| total%:', list.totalPercentage, '| HTTP Test present:', !!found, found ? `(${found.percentage}%)` : '');

  await prisma.$executeRawUnsafe("DELETE FROM employee_nominees WHERE employeeId = ? AND fullName = 'HTTP Test'", EMP);
  await prisma.$disconnect();
  process.exit(0);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
