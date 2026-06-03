const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findUnique({ where: { id: 'c-gcri' } });
  console.log('Before update, logo:', company.logo);
  
  const updated = await prisma.company.update({
    where: { id: 'c-gcri' },
    data: { logo: 'NEW LOGO' }
  });
  
  console.log('After update, logo:', updated.logo);
}

main().finally(() => prisma.$disconnect());
