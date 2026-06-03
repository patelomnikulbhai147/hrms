const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const emps = await prisma.employee.findMany({ where: { branchId: 'c-siddhpur' } });
  const empIds = emps.map(e => e.id);
  const p = await prisma.payroll.count({ where: { employeeId: { in: empIds } } });
  console.log('Payrolls for siddhpur employees:', p);
}
main().finally(() => prisma.$disconnect());
