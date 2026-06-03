const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany();
  console.log('Total DB Employees:', employees.length);
  const archived = employees.filter(e => e.status === 'Archived' || e.status === 'Terminated' || e.status === 'Inactive');
  console.log('Archived/Terminated/Inactive:', archived.length);
  console.log(archived.map(e => ({ id: e.id, name: e.name, status: e.status })));
}
main().finally(() => prisma.$disconnect());
