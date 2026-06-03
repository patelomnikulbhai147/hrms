const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.employee.findMany().then(e => {
  console.log('Total found:', e.length);
  return prisma.$disconnect();
}).catch(e => {
  console.error(e);
});
