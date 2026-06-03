const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const companyId = 'c-siddhpur';
  const payrolls = await prisma.payroll.findMany({
    where: {
      OR: [
        { companyId },
        { employee: { branchId: companyId } },
        { employee: { companyId: companyId } }
      ]
    }
  });
  console.log('Payrolls returned for c-siddhpur:', payrolls.length);
  await prisma.$disconnect();
}
run();
