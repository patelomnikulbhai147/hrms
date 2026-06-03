const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const p = await prisma.payroll.findMany({
    where: { employee: { branchId: 'c-siddhpur' } }
  });
  console.log([...new Set(p.map(x => x.companyId))]);
  await prisma.$disconnect();
}
run();
