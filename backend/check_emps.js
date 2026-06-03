const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const companies = await prisma.company.findMany();
  console.log('Companies:', companies.map(c => c.name));
  const emps = await prisma.employee.findMany({ select: { id: true, companyId: true, name: true, branchId: true } });
  
  const compCounts = {};
  emps.forEach(e => {
    compCounts[e.companyId] = (compCounts[e.companyId] || 0) + 1;
  });
  console.log('Employee counts by companyId:', compCounts);
}
main().finally(() => prisma.$disconnect());
