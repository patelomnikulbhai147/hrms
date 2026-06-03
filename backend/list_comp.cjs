const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.company.findMany().then(c => {
  console.log('Companies:', c.map(x => x.id));
  return prisma.$disconnect();
});
