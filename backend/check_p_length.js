const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const p = await prisma.payroll.findMany({
    where: { OR: [ { companyId: 'c-siddhpur' }, { employee: { branchId: 'c-siddhpur' } }, { employee: { companyId: 'c-siddhpur' } } ] }
  });
  console.log(p.length);
  await prisma.$disconnect();
}
run();
