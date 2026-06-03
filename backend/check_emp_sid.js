const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const emp = await prisma.employee.findFirst({
    where: {
      branchLocation: {
        contains: 'SIDDHPUR',
        mode: 'insensitive'
      }
    }
  });
  console.log(emp);
  await prisma.$disconnect();
}
run();
