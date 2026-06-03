const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.employee.count().then(c => {
  console.log('Employees in DB:', c);
  return prisma.$disconnect();
});
