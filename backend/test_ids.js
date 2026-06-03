const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const emps = await prisma.employee.findMany({ where: { branchLocation: 'SIDDHPUR' } });
  console.log('Employee IDs:', emps.map(e => e.employeeId));
  console.log('Emails:', emps.map(e => e.email));
}
run().finally(() => prisma.$disconnect());
