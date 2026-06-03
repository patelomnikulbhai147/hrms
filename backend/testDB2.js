const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany({ where: { status: { in: ['Archived', 'Terminated', 'Inactive'] } } });
  console.log(JSON.stringify(employees, null, 2));
}
main().finally(() => prisma.$disconnect());
