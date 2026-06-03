const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixBranches() {
  const branches = await prisma.branch.findMany({ include: { employees: true } });
  
  for (const b of branches) {
    if (b.headcount !== b.employees.length) {
      await prisma.branch.update({
        where: { id: b.id },
        data: { headcount: b.employees.length }
      });
      console.log(`Updated branch ${b.branchName} headcount from ${b.headcount} to ${b.employees.length}`);
    }
  }

  // Update company headcount
  const companies = await prisma.company.findMany({ include: { employees: true } });
  for (const c of companies) {
    if (c.employeeCount !== c.employees.length) {
      await prisma.company.update({
        where: { id: c.id },
        data: { employeeCount: c.employees.length }
      });
      console.log(`Updated company ${c.name} employeeCount from ${c.employeeCount} to ${c.employees.length}`);
    }
  }

  await prisma.$disconnect();
}

fixBranches().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
