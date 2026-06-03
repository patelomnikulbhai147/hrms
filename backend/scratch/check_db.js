const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany();
  console.log("Users in DB:", users.length);
  if (users.length > 0) {
    console.log("First user:", users[0].username, "Role:", users[0].role, "Pass:", users[0].password);
  }
}
check().finally(() => prisma.$disconnect());
