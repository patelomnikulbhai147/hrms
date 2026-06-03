const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.payroll.findFirst({include:{employee:true}}).then(e => console.log('Payroll:', e)).finally(() => prisma.$disconnect());
