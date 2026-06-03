const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const emps = await prisma.employee.findMany();
  const statuses = new Set(emps.map(e => e.status));
  console.log('Statuses:', Array.from(statuses));
  
  const compCounts = {};
  emps.forEach(e => {
    compCounts[e.companyId] = (compCounts[e.companyId] || 0) + 1;
  });
  console.log('Company assignments:', compCounts);
  
  const branchCounts = {};
  emps.forEach(e => {
    branchCounts[e.branchId || 'NULL'] = (branchCounts[e.branchId || 'NULL'] || 0) + 1;
  });
  console.log('Branch assignments:', branchCounts);
}
main().finally(() => prisma.$disconnect());
