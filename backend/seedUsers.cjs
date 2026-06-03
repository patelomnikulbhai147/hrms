const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);
  
  await prisma.user.upsert({
    where: { username: 'finance' },
    update: {},
    create: {
      name: 'Finance User',
      email: 'finance@gcri.com',
      username: 'finance',
      passwordHash,
      password: 'password123',
      role: 'Finance',
      companyId: 'c-ahmedabad',
      status: 'Active'
    }
  });

  await prisma.user.upsert({
    where: { username: 'employee' },
    update: {},
    create: {
      name: 'Employee User',
      email: 'employee@gcri.com',
      username: 'employee',
      passwordHash,
      password: 'password123',
      role: 'Employee',
      companyId: 'c-ahmedabad',
      status: 'Active'
    }
  });

  console.log('Finance and Employee users seeded.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
