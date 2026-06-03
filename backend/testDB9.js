const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emps = await prisma.employee.findMany();
  const archived = emps.filter(e => e.status === 'Archived');
  for(const a of archived) {
    const dupes = emps.filter(e => e.employeeId === a.employeeId && e.id !== a.id);
    if(dupes.length) console.log('Duplicate for', a.name, dupes);
  }
}
main().finally(() => prisma.$disconnect());
