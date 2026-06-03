const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const prisma = new PrismaClient();
prisma.branch.findMany().then(branches => {
  console.log(branches.map(b => ({ id: b.id, name: b.branchName, companyId: b.companyId })));
}).finally(() => prisma.$disconnect());
