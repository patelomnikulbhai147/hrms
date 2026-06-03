const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const count = await prisma.payroll.count({
    where: {
      employee: {
        branchLocation: {
          contains: 'SIDDHPUR',
          mode: 'insensitive'
        }
      }
    }
  });
  console.log('Payroll records for Siddhpur:', count);
  await prisma.$disconnect();
}
run();
