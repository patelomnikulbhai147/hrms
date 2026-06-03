const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const e = await prisma.employee.findFirst({
    where: { branchId: 'c-siddhpur' }
  });
  console.log(e.companyId);
  await prisma.$disconnect();
}
run();
