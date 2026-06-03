const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const e = await prisma.employee.findFirst({ where: { branchId: 'c-ahmedabad' } });
  if (e) {
    console.log('companyId:', e.companyId, 'branchId:', e.branchId);
  } else {
    console.log('No employee found for c-ahmedabad');
  }
}
main().finally(() => prisma.$disconnect());
