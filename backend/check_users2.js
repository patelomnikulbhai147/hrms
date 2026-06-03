const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany();
  console.log(users.map(u => ({ id: u.id, name: u.name, username: u.username, email: u.email, role: u.role })));
}

check().catch(console.error).finally(() => prisma.$disconnect());
