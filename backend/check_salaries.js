const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const emps = await prisma.employee.findMany();
  for(const emp of emps) {
    if(emp.salary == null || isNaN(emp.salary)) {
      console.log('Bad salary:', emp.id, emp.salary);
    }
  }
  console.log('Done checking salary.');
  await prisma.$disconnect();
}
run();
