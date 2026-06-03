const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const p = await prisma.payroll.findFirst({
    where: { employee: { branchId: 'c-siddhpur' } }
  });
  console.log('companyId:', p.companyId);
  await prisma.$disconnect();
}
run();
