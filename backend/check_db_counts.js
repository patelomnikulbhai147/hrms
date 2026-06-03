const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const payroll = await prisma.payroll.findMany();
  console.log('Payroll records:', payroll.length);
  const docs = await prisma.document.findMany();
  console.log('Documents:', docs.length);
  await prisma.$disconnect();
}
run();
