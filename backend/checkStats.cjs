const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const payrolls = await prisma.payroll.groupBy({by: ['companyId'], _count: {employeeId: true}, _sum: {netSalary: true}});
  const employees = await prisma.employee.groupBy({by: ['companyId'], _count: {id: true}});
  console.log(JSON.stringify({payrolls, employees}, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
