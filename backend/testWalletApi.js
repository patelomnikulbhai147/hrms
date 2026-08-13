const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const prisma = new PrismaClient();

async function main() {
  // Get token
  const user = await prisma.user.findFirst({ where: { role: 'Company Head' } });
  const secret = process.env.JWT_SECRET || 'enterprise_hrms_super_secret_key_2026';
  const token = jwt.sign({ id: user.id }, secret, { expiresIn: '12h' });
  
  console.log('Testing POST /api/wallet/create-order...');
  const res = await fetch('http://localhost:5000/api/wallet/create-order', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount: 5000 }),
  });
  
  const text = await res.text();
  console.log('HTTP Status:', res.status);
  console.log('Response:', text);
  
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
