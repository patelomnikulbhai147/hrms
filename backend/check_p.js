const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const p = await prisma.payroll.findFirst({ include: { employee: true } });
  console.log(JSON.stringify(p, null, 2));
  await prisma.$disconnect();
}
run();
