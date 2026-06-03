const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findUnique({where: {username: 'officer99'}}).then(u => {
  console.log(JSON.stringify(u, null, 2));
  prisma.$disconnect();
});
