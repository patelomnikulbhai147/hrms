const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.company.findMany().then(c => console.log(c.map(x => x.id))).finally(() => prisma.$disconnect());
