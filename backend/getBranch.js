const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const b = await prisma.branch.findFirst();
  console.log('Branch ID:', b ? b.id : 'None');
  await prisma.$disconnect();
}
run();
