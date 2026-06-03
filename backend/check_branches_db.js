const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBranches() {
  try {
    const branches = await prisma.branch.findMany({
      orderBy: { branchName: 'asc' },
      select: { id: true, branchName: true, companyId: true }
    });
    console.log(`Database Branch Count: ${branches.length}`);
    console.table(branches);
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
checkBranches();
