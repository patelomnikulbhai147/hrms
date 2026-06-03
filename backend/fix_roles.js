const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixRoles() {
  const res = await prisma.user.updateMany({
    where: { role: 'company had ' },
    data: { role: 'Company Head' }
  });
  console.log(`Updated ${res.count} users with typo in role.`);
}

fixRoles().catch(console.error).finally(() => prisma.$disconnect());
