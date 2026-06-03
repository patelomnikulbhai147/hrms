const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const emp = await prisma.employee.findFirst({
    where: { employeeId: 'EMP-3936' }
  });
  console.log('branchLocation:', emp.branchLocation);
  await prisma.$disconnect();
}
run();
