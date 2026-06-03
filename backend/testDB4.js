const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const c = await prisma.company.findUnique({ where: { id: 'c-gcri' } });
  console.log('c-gcri:', c);
  
  const allComp = await prisma.company.findMany();
  console.log('Total companies:', allComp.length);
}
main().finally(() => prisma.$disconnect());
