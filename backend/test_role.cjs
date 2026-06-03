const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findFirst({where: {username: 'superadmin'}}).then(u => {
  console.log(u.role);
  prisma.$disconnect();
});
