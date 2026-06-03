const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const b = await prisma.branch.findUnique({
    where: { id: 'c-siddhpur' }
  });
  console.log(b);
  await prisma.$disconnect();
}
run();
