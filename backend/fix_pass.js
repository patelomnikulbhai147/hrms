const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function fix() {
  const hash = await bcrypt.hash('test1234', 10);
  await prisma.user.updateMany({
    where: { username: 'superadmin' },
    data: { passwordHash: hash }
  });
  console.log('Fixed pass');
}

fix().catch(console.error).finally(() => prisma.$disconnect());
