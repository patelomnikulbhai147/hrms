const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emps = await prisma.employee.findMany({ where: { companyId: 'c-gcri' } });
  console.log(JSON.stringify(emps.map(e => ({id: e.id, name: e.name, status: e.status, employeeId: e.employeeId})), null, 2));
}
main().finally(() => prisma.$disconnect());
