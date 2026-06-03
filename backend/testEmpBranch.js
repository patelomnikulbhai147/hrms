const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.employee.findFirst({ where: { branchId: 'c-siddhpur' } });
  console.log('branchLocation:', emp.branchLocation);
  console.log('branchId:', emp.branchId);
}
main().finally(() => prisma.$disconnect());
