const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    if(u.username === 'superadmin' || u.username === 'siddhpur-admin') {
      console.log(u.username, '->', await bcrypt.compare('REDACTED', u.passwordHash));
    }
  }
}
main().finally(() => prisma.$disconnect());
