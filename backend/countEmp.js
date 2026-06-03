const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.employee.findMany().then(e => console.log('Total Employees:', e.length)).finally(() => prisma.$disconnect());
