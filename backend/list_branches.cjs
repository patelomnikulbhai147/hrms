const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.branch.findMany().then(c => {
  console.log('Branches:', c.map(x => x.id));
  return prisma.$disconnect();
}).catch(e => {
  console.log('Error:', e.message);
  return prisma.$disconnect();
});
