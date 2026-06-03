const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const comps = await prisma.company.findMany();
  const branches = await prisma.branch.findMany();
  const emps = await prisma.employee.findMany();
  console.log('Companies:', comps.map(c => ({ id: c.id, name: c.name })));
  console.log('Branches:', branches.map(b => ({ id: b.id, name: b.branchName, companyId: b.companyId })));
  console.log('Employees:', emps.length > 0 ? emps.slice(0, 2) : 'No employees');
}
check().finally(() => prisma.$disconnect());
