const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    if (await bcrypt.compare('welcome123', u.passwordHash)) {
      console.log(u.username, '-> welcome123 Match: true');
    } else if (await bcrypt.compare('superadmin', u.passwordHash)) {
      console.log(u.username, '-> superadmin Match: true');
    } else if (await bcrypt.compare('admin', u.passwordHash)) {
      console.log(u.username, '-> admin Match: true');
    } else {
      console.log(u.username, '-> NO MATCH FOR welcome123 OR superadmin');
    }
  }
}
main().finally(() => prisma.$disconnect());
