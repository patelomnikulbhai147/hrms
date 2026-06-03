const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const p = await prisma.payroll.findFirst({
    where: { employee: { branchId: 'c-siddhpur' } },
    include: { employee: true }
  });
  console.log('employeeId:', p.employeeId);
  console.log('p.employee.id:', p.employee.id);
  console.log('p.employee.employeeId:', p.employee.employeeId);
  await prisma.$disconnect();
}
run();
