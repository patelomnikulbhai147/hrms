const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const om = await prisma.user.findFirst({ where: { username: 'om' } });
  if (om) {
    await prisma.user.update({
      where: { id: om.id },
      data: { accessibleCompanyIds: ['c-ahmedabad', 'c-rajkot', 'c-bhavnagar', 'c-siddhpur'] }
    });
    console.log('Updated om workspaces');
  }
  await prisma.$disconnect();
}
run();
