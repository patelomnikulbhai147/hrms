const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const emps = await prisma.employee.findMany();
  const compCount = {};
  for (let e of emps) {
    compCount[e.companyId] = (compCount[e.companyId] || 0) + 1;
  }
  console.log('Employee Company ID distribution:', compCount);

  const users = await prisma.user.findMany();
  const uCompCount = {};
  for (let u of users) {
    uCompCount[u.companyId] = (uCompCount[u.companyId] || 0) + 1;
  }
  console.log('User Company ID distribution:', uCompCount);

  const comps = await prisma.company.findMany();
  console.log('Companies in DB:', comps.map(c => c.id));

  const branches = await prisma.branch.findMany();
  console.log('Branches in DB:', branches.map(b => b.id));

  await prisma.$disconnect();
}

run();
