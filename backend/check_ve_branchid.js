const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const e = await prisma.employee.findFirst({
    where: { id: { startsWith: 'emp-gcri-VE' } }
  });
  console.log('branchId:', e.branchId);
  await prisma.$disconnect();
}
run();
