const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const p = await prisma.payroll.findFirst({
    where: { employee: { branchId: 'c-siddhpur' } }
  });
  console.log('netSalary:', p.netSalary, typeof p.netSalary);
  await prisma.$disconnect();
}
run();
