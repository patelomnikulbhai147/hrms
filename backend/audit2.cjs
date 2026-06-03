const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emps = await prisma.employee.findMany();
  
  const badComps = emps.filter(e => !e.companyId);
  const badBranches = emps.filter(e => !e.branchId);
  console.log('Employees with no company:', badComps.length);
  console.log('Employees with no branch:', badBranches.length);
  
  await prisma.$disconnect();
}
main();
