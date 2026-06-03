const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const users = await prisma.user.findMany();
  for(let u of users) {
    console.log(`User: ${u.username}, Role: ${u.role}, Status: ${u.status}, pwHashLen: ${u.passwordHash?.length}`);
  }
  await prisma.$disconnect();
}
run();
