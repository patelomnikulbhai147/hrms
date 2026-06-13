// Create (or reset) a Super Admin login — works on a fresh database where IDs
// are auto-increment integers. Unlike migrateUsers.js (which imports legacy
// records with old string IDs), this lets the DB assign the integer id and does
// not tie the account to a company.
//
// Usage (override any value via env):
//   ADMIN_USERNAME=admin ADMIN_PASSWORD='YourStrongPass' node scripts/createAdmin.js
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

const username = process.env.ADMIN_USERNAME || 'admin';
const email = process.env.ADMIN_EMAIL || 'admin@company.com';
const name = process.env.ADMIN_NAME || 'Super Admin';
const password = process.env.ADMIN_PASSWORD || 'Admin@12345';

(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { username },
    update: { passwordHash, email, name, role: 'Super Admin', status: 'Active' },
    create: {
      name,
      email,
      username,
      passwordHash,
      role: 'Super Admin',
      status: 'Active',
      accessibleCompanyIds: [],
    },
  });
  console.log('\n✅ Super Admin ready — log in with:');
  console.log('   username: ' + username);
  console.log('   password: ' + password);
  console.log('   (db id: ' + user.id + ')\n');
})()
  .catch((e) => {
    console.error('❌ Failed to create admin:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
