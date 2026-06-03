const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findFirst({where:{username:'om'}}).then(console.log).finally(() => prisma.$disconnect());
