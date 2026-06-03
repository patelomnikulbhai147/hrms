const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const branchInBranchTable = await prisma.branch.findUnique({ where: { id: 'c-ahmedabad' } });
  const branchInCompanyTable = await prisma.company.findUnique({ where: { id: 'c-ahmedabad' } });
  
  console.log('In Branch table:', !!branchInBranchTable);
  console.log('In Company table:', !!branchInCompanyTable);
}
main().finally(() => prisma.$disconnect());
