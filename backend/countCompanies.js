const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.company.count().then(console.log).finally(() => prisma.$disconnect());
