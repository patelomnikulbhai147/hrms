const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.branch.findMany().then(b => console.log(JSON.stringify(b.map(x => x.branchName)))).finally(() => prisma.$disconnect());
