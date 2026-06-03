const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.employee.findMany({ where: { employeeId: 'VE1831' } });
  console.log(emp);
}
main().finally(() => prisma.$disconnect());
