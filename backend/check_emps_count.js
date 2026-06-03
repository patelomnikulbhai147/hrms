const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const emps = await prisma.employee.findMany({
    where: { branchLocation: { contains: 'SIDDHPUR', mode: 'insensitive' } }
  });
  console.log('Total emps:', emps.length);
  const ve = emps.filter(e => e.id.includes('VE'));
  console.log('VE emps:', ve.length);
  const uuids = emps.filter(e => !e.id.includes('VE'));
  console.log('UUID emps:', uuids.length);
  await prisma.$disconnect();
}
run();
