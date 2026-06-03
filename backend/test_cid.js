const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const emps = await prisma.employee.findMany();
  const counts = {};
  emps.forEach(e => {
    const cid = e.companyId || 'NULL';
    counts[cid] = (counts[cid] || 0) + 1;
  });
  console.log(counts);
}

run().finally(() => prisma.$disconnect());
