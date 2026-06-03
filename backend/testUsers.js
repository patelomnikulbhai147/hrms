const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log(users.map(u => ({ username: u.username, password: u.password, role: u.role })));
}
main().finally(() => prisma.$disconnect());
