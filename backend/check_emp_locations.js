const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const emps = await prisma.employee.findMany();
  console.log(emps.slice(0, 10).map(e => ({ name: e.name, companyId: e.companyId, branchLocation: e.branchLocation })));
  await prisma.$disconnect();
}
run();
