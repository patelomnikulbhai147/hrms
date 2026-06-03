const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const p = await prisma.payroll.findFirst({ where: { employee: { branchId: 'c-siddhpur' } }, include: { employee: true } });
  console.log(p.employee.branchId);
}
main().finally(() => prisma.$disconnect());
