const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany();
  console.log('DB Users Count:', users.length);
  console.log(users.map(u => ({ id: u.id, username: u.username, role: u.role, companyId: u.companyId, accessible: u.accessibleCompanyIds })));
}

check().catch(console.error).finally(() => prisma.$disconnect());
