const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const p = await prisma.payroll.findMany({
    where: { employee: { branchId: 'c-siddhpur' } }
  });
  console.log(p.map(x => x.netSalary));
  await prisma.$disconnect();
}
run();
