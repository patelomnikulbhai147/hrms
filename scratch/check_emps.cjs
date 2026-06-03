const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const emps = await prisma.employee.findMany();
  const badEmps = emps.filter(e => !e.name || !e.employeeId || !e.designation);
  console.log('Total emps:', emps.length);
  console.log('Bad Employees:', badEmps);
}
main().finally(() => prisma.$disconnect());
