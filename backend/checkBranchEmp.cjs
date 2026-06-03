const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const emp = await prisma.employee.findMany({where: {branchId: 'c-rajkot'}});
  console.log(`Employees in Rajkot: ${emp.length}`);
  const allEmp = await prisma.employee.findMany({where: {companyId: 'c-gcri'}, select: {branchId: true}});
  const counts = {};
  for (const e of allEmp) {
    counts[e.branchId] = (counts[e.branchId] || 0) + 1;
  }
  console.log('Branch distribution in c-gcri:', counts);
}
main().catch(console.error).finally(() => prisma.$disconnect());
