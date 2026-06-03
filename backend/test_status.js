const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const emps = await prisma.employee.findMany({ where: { branchLocation: 'SIDDHPUR' } });
  console.log(emps.map(e => e.status));
}
run().finally(() => prisma.$disconnect());
