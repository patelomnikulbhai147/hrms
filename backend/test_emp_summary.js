const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const emps = await prisma.employee.findMany({ select: { branchLocation: true } });
  const counts = {};
  emps.forEach(e => {
    const loc = e.branchLocation || 'NULL';
    counts[loc] = (counts[loc] || 0) + 1;
  });
  console.log(counts);
}

run().finally(() => prisma.$disconnect());
