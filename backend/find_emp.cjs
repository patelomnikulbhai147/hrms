const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.employee.findFirst().then(e => {
  console.log(e);
  return prisma.$disconnect();
});
