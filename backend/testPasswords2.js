const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    let match = false;
    if (u.password && u.password !== 'REDACTED') {
       match = await bcrypt.compare(u.password, u.passwordHash);
       console.log(u.username, '->', u.password, 'Match:', match);
    } else {
       console.log(u.username, 'has REDACTED or null password');
    }
  }
}
main().finally(() => prisma.$disconnect());
