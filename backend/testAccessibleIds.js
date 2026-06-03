const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { username: true, companyId: true, accessibleCompanyIds: true } });
  console.log(users);
}
main().finally(() => prisma.$disconnect());
