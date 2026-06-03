const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany();
  const branches = await prisma.branch.findMany();
  console.log('Companies:', companies);
  console.log('Branches:', branches);
}

main().finally(() => prisma.$disconnect());
