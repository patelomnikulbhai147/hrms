const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emps = await prisma.employee.findMany();
  const ids = emps.map(e => e.employeeId);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  console.log('Duplicates:', dupes);
}
main().finally(() => prisma.$disconnect());
