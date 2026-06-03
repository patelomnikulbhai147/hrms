const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const p = await prisma.payroll.findFirst({
    where: { employee: { branchId: 'c-siddhpur' } },
    include: { employee: true }
  });
  console.log(JSON.stringify(p));
  await prisma.$disconnect();
}
run();
