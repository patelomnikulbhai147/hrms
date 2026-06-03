const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const emps = await prisma.employee.findMany({
    where: { branchLocation: 'SIDDHPUR' }
  });
  console.log([...new Set(emps.map(e => e.branchId))]);
  await prisma.$disconnect();
}
run();
