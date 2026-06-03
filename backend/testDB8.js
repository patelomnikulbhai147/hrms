const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emps = await prisma.employee.findMany();
  const archived = emps.filter(e => e.status === 'Archived' || e.status === 'Terminated');
  
  for (const a of archived) {
    const sames = emps.filter(e => e.email === a.email || e.name === a.name || e.employeeId === a.employeeId);
    if (sames.length > 1) {
      console.log('Found multiple for', a.name, sames.map(s => ({id: s.id, status: s.status, name: s.name})));
    }
  }
}
main().finally(() => prisma.$disconnect());
